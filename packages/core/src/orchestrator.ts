import { rm } from 'node:fs/promises'
import { join } from 'node:path'
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
  env: BuildEnv
}

/** Build the requested projects (plus their local-dep closure) in graph order. */
export async function buildWorkspace(opts: BuildOptions): Promise<void> {
  const { graph } = loadWorkspaceGraph(opts.root)
  const { levels } = topoSort(graph)

  const selected = opts.all
    ? new Set(graph.nodes.keys())
    : selectWithDeps(
        graph,
        (opts.targets ?? []).map((t) => resolveProjectName(graph, t)),
      )

  const managedSelected = [...selected].filter((n) => graph.nodes.get(n)?.managed)
  if (managedSelected.length === 0) {
    logger.warn('No managed nestkit projects selected (missing nestkit.json?).')
    return
  }

  const start = performance.now()
  for (const level of levels) {
    const batch = level.filter((n) => selected.has(n) && graph.nodes.get(n)?.managed)
    await Promise.all(
      batch.map(async (name) => {
        const project = graph.nodes.get(name)!
        const result = await buildProject(project, opts.root, opts.env, false)
        logger.success(
          `${c.bold(name)} ${c.dim(`(${project.type})`)} built in ${ms(result.durationMs)}`,
        )
      }),
    )
  }
  logger.info(`Done in ${ms(performance.now() - start)}`)
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

  const compiler = env.getCompiler(project.compiler)
  const result = await compiler.build(ctx)

  // Libraries additionally emit declaration files for consumers (skipped in dev).
  if (project.type === 'lib' && !watch) {
    await env.getDtsBuilder().emitDts(project, root)
  }
  return result
}

/** Run a whole-graph type check. */
export async function typecheckWorkspace(root: string, env: BuildEnv): Promise<boolean> {
  const { projects } = loadWorkspaceGraph(root)
  // Frontend projects (Vite, etc.) run their own type checking; tsc covers apps and libs.
  const managed = projects.filter((p) => p.managed && p.type !== 'app-frontend')
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
