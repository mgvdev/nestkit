import { type ChildProcess, spawn } from 'node:child_process'
import { type FSWatcher, watch as chokidarWatch } from 'chokidar'
import type { BuildEnv } from './compiler.js'
import { type OutputSink, createOutput } from './dev-output.js'
import { type ProjectGraph, resolveProjectName, selectWithDeps, topoSort } from './graph.js'
import { c, logger, ms } from './logger.js'
import { buildProject, loadWorkspaceGraph } from './orchestrator.js'
import type { Project } from './types.js'
import { loadWorkspaceConfig } from './workspace-config.js'

/** JS runtime used to launch an app process. */
type Runtime = 'node' | 'bun'

export interface DevOptions {
  root: string
  /** Project names/refs to run. Comma lists are already split by the caller. */
  targets?: string[]
  /** Single target (back-compat); merged into `targets`. */
  target?: string
  /** Run every managed app + app-frontend. */
  all?: boolean
  env: BuildEnv
  /** Run tsc typecheck out-of-band on changes. Default true. */
  typecheck?: boolean
  /** Use the split-panes TUI (falls back to prefixed lines off a TTY). */
  tui?: boolean
  /** Base port for apps without an explicit devPort (default 3000). */
  portBase?: number
  /** Start apps with the Node inspector attached. */
  inspect?: boolean
  /** Start apps with the inspector attached and paused before user code. */
  inspectBrk?: boolean
}

export interface DevController {
  stop(): Promise<void>
}

function debounce(fn: () => void, delayMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, delayMs)
  }
}

const isRunnable = (p: Project) => p.type === 'app' || p.type === 'app-frontend'

/** Resolve an app's dev port: its fixed `devPort`, else base + its index. */
export function devPortFor(target: Project, index: number, portBase = 3000): number {
  return target.devPort ?? portBase + index
}

/**
 * Resolve the runnable dev targets from a request. `all` selects every managed
 * app + app-frontend; otherwise each ref is resolved and must be runnable.
 * Throws on unknown, unmanaged, or non-runnable (lib) targets.
 */
export function resolveDevTargets(
  graph: ProjectGraph,
  opts: { targets?: string[]; target?: string; all?: boolean },
): Project[] {
  const requested = opts.all
    ? [...graph.nodes.values()].filter((p) => p.managed && isRunnable(p)).map((p) => p.name)
    : [...(opts.targets ?? []), ...(opts.target ? [opts.target] : [])].map((t) =>
        resolveProjectName(graph, t),
      )

  const runnables: Project[] = []
  const seen = new Set<string>()
  for (const name of requested) {
    if (seen.has(name)) continue
    seen.add(name)
    const p = graph.nodes.get(name)!
    if (!p.managed) throw new Error(`Project "${name}" has no nestkit.json`)
    if (!isRunnable(p)) {
      throw new Error(
        `Project "${name}" is a ${p.type ?? 'unknown'} — libs aren't runnable; add it to an app instead.`,
      )
    }
    runnables.push(p)
  }
  if (runnables.length === 0) throw new Error('No dev targets. Pass project name(s) or --all.')
  return runnables
}

/** Short, unique labels for runners (unscoped name; full name on collision). */
function makeLabels(runnables: Project[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const r of runnables) {
    const base = r.name.split('/').pop()!
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  const labels = new Map<string, string>()
  for (const r of runnables) {
    const base = r.name.split('/').pop()!
    labels.set(r.name, (counts.get(base) ?? 0) > 1 ? r.name : base)
  }
  return labels
}

/**
 * Run one or more projects in dev mode in parallel: build the union of their
 * local-dep closures, start a process per runnable target with labeled output,
 * and watch every source dir to rebuild + restart the affected targets.
 */
export async function dev(opts: DevOptions): Promise<DevController> {
  const { graph } = loadWorkspaceGraph(opts.root)
  const runnables = resolveDevTargets(graph, opts)
  const labelOf = makeLabels(runnables)

  // The Bun HTTP adapter needs the Bun runtime (it references the global `Bun`);
  // launch app processes with `bun` when the workspace targets that adapter.
  const runtime: Runtime = loadWorkspaceConfig(opts.root)?.httpAdapter === 'bun' ? 'bun' : 'node'

  // Union of every target's local-dep closure, plus which targets each project feeds.
  const watched = new Map<string, Project>()
  const dependents = new Map<string, string[]>()
  for (const r of runnables) {
    for (const n of selectWithDeps(graph, [r.name])) {
      const p = graph.nodes.get(n)!
      if (!p.managed) continue
      watched.set(n, p)
      ;(dependents.get(n) ?? dependents.set(n, []).get(n)!).push(r.name)
    }
  }

  const sink = createOutput(
    runnables.map((r) => labelOf.get(r.name)!),
    opts.tui ?? false,
  )

  // Build the whole union once, in dependency order.
  const { order } = topoSort(graph)
  const buildList = order.filter((n) => watched.has(n)).map((n) => watched.get(n)!)
  logger.start(`Building ${buildList.length} project(s) for dev...`)
  for (const p of buildList) {
    const r = await buildProject(p, opts.root, opts.env, true)
    logger.success(`${c.bold(p.name)} ${c.dim(`(${p.type})`)} in ${ms(r.durationMs)}`)
  }

  const runners = new Map<string, Runner>()
  runnables.forEach((r, index) => {
    const runner = createRunner(r, labelOf.get(r.name)!, opts, sink, index, runtime)
    runners.set(r.name, runner)
    runner.start()
  })

  const rebuild = async (p: Project) => {
    const t0 = performance.now()
    try {
      await buildProject(p, opts.root, opts.env, true)
      for (const rname of dependents.get(p.name) ?? []) {
        const runner = runners.get(rname)
        if (!runner) continue
        runner.note(`${p.name} changed — restarting (${ms(performance.now() - t0)})`)
        runner.restart()
        if (opts.typecheck !== false) runner.typecheckBackground()
      }
    } catch (err) {
      logger.error(`Rebuild of ${p.name} failed: ${(err as Error).message}`)
    }
  }

  const watchers: FSWatcher[] = []
  for (const p of watched.values()) {
    const trigger = debounce(() => void rebuild(p), 120)
    const w = chokidarWatch(p.sourceDir, { ignoreInitial: true, ignored: /(^|[/\\])\../ })
    w.on('all', trigger)
    watchers.push(w)
  }

  logger.box(
    `nestkit dev — ${runnables.length} process(es), watching ${watched.size} project(s). Ctrl+C to stop.`,
  )

  return {
    async stop() {
      await Promise.all(watchers.map((w) => w.close()))
      await Promise.all([...runners.values()].map((r) => r.stop()))
      sink.close()
    },
  }
}

interface Runner {
  start(): void
  restart(): void
  stop(): Promise<void>
  note(line: string): void
  typecheckBackground(): void
}

/** Manages one runnable target's process (app child process or frontend dev server). */
function createRunner(
  target: Project,
  label: string,
  opts: DevOptions,
  sink: OutputSink,
  index: number,
  runtime: Runtime,
): Runner {
  let child: ChildProcess | null = null
  let frontend: { close(): Promise<void> } | null = null
  let typechecking = false

  // Distinct port and inspector port per app so `dev --all` doesn't collide.
  const port = devPortFor(target, index, opts.portBase)
  const inspectPort = 9229 + index

  const startApp = () => {
    if (!target.entryOut) throw new Error(`App "${target.name}" has no entry output`)
    // Node uses its own binary (process.execPath); Bun apps need the `bun`
    // executable from PATH so the global `Bun` API is available at runtime.
    const exec = runtime === 'bun' ? 'bun' : process.execPath
    const args: string[] = []
    if (opts.inspectBrk) args.push(`--inspect-brk=${inspectPort}`)
    else if (opts.inspect) args.push(`--inspect=${inspectPort}`)
    args.push(target.entryOut)

    child = spawn(exec, args, {
      cwd: target.dir,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(port) },
    })
    const inspectNote = opts.inspect || opts.inspectBrk ? `  inspect :${inspectPort}` : ''
    const runtimeNote = runtime === 'bun' ? ' (bun)' : ''
    sink.note(label, `starting on port ${port}${runtimeNote}${inspectNote}`)
    child.on('error', (err: NodeJS.ErrnoException) => {
      const hint =
        runtime === 'bun' && err.code === 'ENOENT'
          ? ' — is Bun installed and on PATH? (https://bun.sh)'
          : ''
      sink.write(label, 'err', `failed to start with ${exec}: ${err.message}${hint}`)
    })
    child.stdout?.on('data', (d: Buffer) => sink.write(label, 'out', d.toString()))
    child.stderr?.on('data', (d: Buffer) => sink.write(label, 'err', d.toString()))
    child.on('exit', (code, signal) => {
      if (code !== null && code !== 0 && !signal) {
        sink.write(label, 'err', `exited with code ${code}`)
      }
    })
  }

  const stopApp = () =>
    new Promise<void>((resolve) => {
      if (!child) return resolve()
      const proc = child
      child = null
      const timeout = setTimeout(() => proc.kill('SIGKILL'), 3000)
      proc.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
      proc.kill('SIGTERM')
    })

  return {
    start() {
      if (target.type === 'app-frontend') {
        const adapter = opts.env.getFrontendAdapter(target.adapter ?? 'vite')
        void adapter
          .serve({
            project: target,
            root: opts.root,
            watch: true,
            emit: (chunk, stream) => sink.write(label, stream, chunk),
          })
          .then((s) => {
            frontend = s
            if (s.url) sink.note(label, `serving at ${s.url}`)
          })
        return
      }
      startApp()
    },
    restart() {
      if (target.type === 'app-frontend') return // Vite has its own HMR.
      void stopApp().then(startApp)
    },
    async stop() {
      await stopApp()
      if (frontend) await frontend.close()
    },
    note(line) {
      sink.note(label, line)
    },
    typecheckBackground() {
      if (typechecking) return
      typechecking = true
      void opts.env
        .getTypeChecker()
        .check([target], opts.root)
        .then((r) => {
          if (!r.ok) sink.note(label, `typecheck: ${r.diagnostics.length} error(s)`)
        })
        .finally(() => {
          typechecking = false
        })
    },
  }
}
