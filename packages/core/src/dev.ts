import { type ChildProcess, spawn } from 'node:child_process'
import { type FSWatcher, watch as chokidarWatch } from 'chokidar'
import type { BuildEnv } from './compiler.js'
import { resolveProjectName, selectWithDeps } from './graph.js'
import { c, logger, ms } from './logger.js'
import { buildProject, loadWorkspaceGraph } from './orchestrator.js'
import type { Project } from './types.js'

export interface DevOptions {
  root: string
  target: string
  env: BuildEnv
  /** Run tsc typecheck out-of-band on changes. Default true. */
  typecheck?: boolean
}

export interface DevController {
  stop(): Promise<void>
}

/** Debounce a zero-arg async function, coalescing bursts of calls. */
function debounce(fn: () => void, delayMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, delayMs)
  }
}

/**
 * Start dev mode for a project: build its local-dep closure, run the app,
 * and watch every source dir to rebuild + restart on change.
 */
export async function dev(opts: DevOptions): Promise<DevController> {
  const { graph } = loadWorkspaceGraph(opts.root)
  const targetName = resolveProjectName(graph, opts.target)
  const target = graph.nodes.get(targetName)!
  if (!target.managed) throw new Error(`Project "${targetName}" has no nestkit.json`)

  const closure = [...selectWithDeps(graph, [targetName])]
    .map((n) => graph.nodes.get(n)!)
    .filter((p) => p.managed)

  // Initial build of the whole closure (libs first is not required for swc transform,
  // but keeps dist present before the app boots).
  logger.start(`Building ${closure.length} project(s) for dev...`)
  for (const p of closure) {
    const r = await buildProject(p, opts.root, opts.env, true)
    logger.success(`${c.bold(p.name)} ${c.dim(`(${p.type})`)} in ${ms(r.durationMs)}`)
  }

  const runner = createRunner(target, opts)
  runner.start()

  const rebuild = async (p: Project) => {
    const t0 = performance.now()
    try {
      await buildProject(p, opts.root, opts.env, true)
      logger.info(`Rebuilt ${c.bold(p.name)} in ${ms(performance.now() - t0)}`)
      runner.restart()
      if (opts.typecheck !== false) runner.typecheckBackground()
    } catch (err) {
      logger.error(`Rebuild of ${p.name} failed: ${(err as Error).message}`)
    }
  }

  const watchers: FSWatcher[] = []
  for (const p of closure) {
    const trigger = debounce(() => void rebuild(p), 120)
    const w = chokidarWatch(p.sourceDir, { ignoreInitial: true, ignored: /(^|[/\\])\../ })
    w.on('all', trigger)
    watchers.push(w)
  }

  logger.box(`nestkit dev — watching ${closure.length} project(s). Press Ctrl+C to stop.`)

  return {
    async stop() {
      await Promise.all(watchers.map((w) => w.close()))
      await runner.stop()
    },
  }
}

interface Runner {
  start(): void
  restart(): void
  stop(): Promise<void>
  typecheckBackground(): void
}

/** Manages the app child process (or a frontend dev server). */
function createRunner(target: Project, opts: DevOptions): Runner {
  let child: ChildProcess | null = null
  let frontend: { close(): Promise<void> } | null = null
  let typechecking = false

  const startApp = () => {
    if (!target.entryOut) throw new Error(`App "${target.name}" has no entry output`)
    child = spawn(process.execPath, [target.entryOut], {
      cwd: target.dir,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code, signal) => {
      if (code !== null && code !== 0 && !signal) {
        logger.warn(`${target.name} exited with code ${code}`)
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
        void adapter.serve({ project: target, root: opts.root, watch: true }).then((s) => {
          frontend = s
          if (s.url) logger.success(`${target.name} serving at ${c.cyan(s.url)}`)
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
    typecheckBackground() {
      if (typechecking) return
      typechecking = true
      void opts.env
        .getTypeChecker()
        .check([target], opts.root)
        .then((r) => {
          if (!r.ok) logger.warn(`Typecheck: ${r.diagnostics.length} error(s)`)
        })
        .finally(() => {
          typechecking = false
        })
    },
  }
}
