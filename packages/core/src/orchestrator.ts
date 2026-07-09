import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { affectedProjects } from './affected.js'
import { hashProject, isCached, loadCache, saveCache } from './cache.js'
import type { BuildEnv, BuildResult } from './compiler.js'
import {
  type ProjectGraph,
  buildGraph,
  resolveProjectName,
  selectWithDeps,
  topoSort,
} from './graph.js'
import { c, logger, ms } from './logger.js'
import { resolveProjects } from './project.js'
import type { Project, Workspace } from './types.js'
import { discoverWorkspace } from './workspace.js'

export interface LoadedWorkspace {
  workspace: Workspace
  projects: Project[]
  graph: ProjectGraph
}

/** Discover the workspace and build its project graph. */
export function loadWorkspaceGraph(root: string): LoadedWorkspace {
  const workspace = discoverWorkspace(root)
  const projects = resolveProjects(workspace)
  const graph = buildGraph(projects)
  return { workspace, projects, graph }
}

export interface BuildOptions {
  root: string
  /** Explicit project targets. Ignored when `all` is true. */
  targets?: string[]
  all?: boolean
  /** Build only projects affected by changes since this git ref (+ dependents). */
  affected?: string
  /** Skip the content-hash cache (rebuild everything selected). */
  noCache?: boolean
  env: BuildEnv
}

/** Build the requested projects (plus their local-dep closure) in graph order. */
export async function buildWorkspace(opts: BuildOptions): Promise<void> {
  const { graph } = loadWorkspaceGraph(opts.root)
  const { levels } = topoSort(graph)

  let selected: Set<string>
  if (opts.affected) selected = affectedProjects(graph, opts.root, opts.affected)
  else if (opts.all) selected = new Set(graph.nodes.keys())
  else
    selected = selectWithDeps(
      graph,
      (opts.targets ?? []).map((t) => resolveProjectName(graph, t)),
    )

  const managedSelected = [...selected].filter((n) => graph.nodes.get(n)?.managed)
  if (managedSelected.length === 0) {
    logger.warn(
      opts.affected
        ? `No managed projects affected since ${opts.affected}.`
        : 'No managed nestkit projects selected (missing nestkit.json?).',
    )
    return
  }

  const cache = opts.noCache ? {} : loadCache(opts.root)
  const hashes: Record<string, string> = {}
  let built = 0
  let cached = 0

  const start = performance.now()
  for (const level of levels) {
    const batch = level.filter((n) => graph.nodes.get(n)?.managed)
    await Promise.all(
      batch.map(async (name) => {
        const project = graph.nodes.get(name)!
        // Hash every managed project (even unselected) so dependents' hashes are correct.
        const hash = hashProject(project, hashes)
        hashes[name] = hash
        if (!selected.has(name)) return

        if (!opts.noCache && isCached(project, hash, cache)) {
          cached++
          logger.log(`${c.dim('cached')} ${c.bold(name)}`)
          return
        }
        const result = await buildProject(project, opts.root, opts.env, false)
        cache[name] = hash
        built++
        logger.success(
          `${c.bold(name)} ${c.dim(`(${project.type})`)} built in ${ms(result.durationMs)}`,
        )
      }),
    )
  }
  if (!opts.noCache) saveCache(opts.root, cache)
  logger.info(`Done in ${ms(performance.now() - start)} — ${built} built, ${cached} cached`)
}

/** Build a single project through the right adapter. */
export async function buildProject(
  project: Project,
  root: string,
  env: BuildEnv,
  watch: boolean,
): Promise<BuildResult> {
  const ctx = { project, root, watch }

  if (project.type === 'app-frontend') {
    const adapter = env.getFrontendAdapter(project.adapter ?? 'vite')
    return adapter.build(ctx)
  }

  // Nest CLI plugins (swagger/graphql) can't run inside SWC — generate their
  // metadata.ts first so the transform picks it up.
  if (project.type === 'app' && project.nestPlugins.length > 0) {
    const gen = env.getMetadataGenerator?.()
    if (gen) await gen.generate(project, root)
  }

  const compiler = env.getCompiler(project.compiler)
  const result = await compiler.build(ctx)

  // Libraries additionally emit declaration files for consumers (skipped in dev).
  if (project.type === 'lib' && !watch) {
    await env.getDtsBuilder().emitDts(project, root)
  }
  return result
}

/** Run a whole-graph type check (optionally limited to affected projects). */
export async function typecheckWorkspace(
  root: string,
  env: BuildEnv,
  affected?: string,
): Promise<boolean> {
  const { projects, graph } = loadWorkspaceGraph(root)
  const affectedSet = affected ? affectedProjects(graph, root, affected) : null
  // Frontend projects (Vite, etc.) run their own type checking; tsc covers apps and libs.
  const managed = projects.filter(
    (p) => p.managed && p.type !== 'app-frontend' && (!affectedSet || affectedSet.has(p.name)),
  )
  if (managed.length === 0) {
    logger.info(
      affected ? `No affected projects to typecheck since ${affected}.` : 'Nothing to typecheck.',
    )
    return true
  }
  const result = await env.getTypeChecker().check(managed, root)
  if (result.output.trim()) logger.log(result.output.trimEnd())
  if (result.ok) logger.success('Typecheck passed')
  else logger.error(`Typecheck failed (${result.diagnostics.length} error(s))`)
  return result.ok
}

/** Remove build outputs (outDir + tsbuildinfo) for managed projects. */
export async function cleanWorkspace(root: string, targets?: string[]): Promise<void> {
  const { projects, graph } = loadWorkspaceGraph(root)
  const set =
    targets && targets.length > 0 ? new Set(targets.map((t) => resolveProjectName(graph, t))) : null
  const toClean = projects.filter((p) => p.managed && (!set || set.has(p.name)))
  await Promise.all(
    toClean.map(async (p) => {
      await rm(p.outDir, { recursive: true, force: true })
      await rm(join(p.dir, 'tsconfig.tsbuildinfo'), { force: true })
      logger.info(`Cleaned ${c.bold(p.name)}`)
    }),
  )
}
