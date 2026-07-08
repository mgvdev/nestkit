import { basename } from 'node:path'
import type { Project } from './types.js'

export interface ProjectGraph {
  /** Project name -> Project. */
  nodes: Map<string, Project>
  /** Project name -> names of its local dependencies (edges point at deps). */
  edges: Map<string, string[]>
}

export class CycleError extends Error {
  constructor(readonly cycle: string[]) {
    super(`Dependency cycle detected: ${cycle.join(' -> ')}`)
    this.name = 'CycleError'
  }
}

/** Build a project graph from resolved projects. Edges are local deps only. */
export function buildGraph(projects: Project[]): ProjectGraph {
  const nodes = new Map(projects.map((p) => [p.name, p]))
  const edges = new Map<string, string[]>()
  for (const p of projects) {
    // Keep only deps that are actually present as nodes.
    edges.set(
      p.name,
      p.localDeps.filter((d) => nodes.has(d)),
    )
  }
  return { nodes, edges }
}

/**
 * Topologically sort the graph so that dependencies come before dependents.
 * Groups nodes into levels; nodes in the same level are independent and may
 * build in parallel. Throws CycleError on cycles.
 */
export function topoSort(graph: ProjectGraph): { order: string[]; levels: string[][] } {
  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const name of graph.nodes.keys()) {
    indegree.set(name, 0)
    dependents.set(name, [])
  }
  for (const [name, deps] of graph.edges) {
    indegree.set(name, deps.length)
    for (const dep of deps) dependents.get(dep)?.push(name)
  }

  const order: string[] = []
  const levels: string[][] = []
  let frontier = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([n]) => n)
    .sort()

  while (frontier.length > 0) {
    levels.push(frontier)
    const next: string[] = []
    for (const name of frontier) {
      order.push(name)
      for (const dep of dependents.get(name) ?? []) {
        const d = (indegree.get(dep) ?? 0) - 1
        indegree.set(dep, d)
        if (d === 0) next.push(dep)
      }
    }
    frontier = next.sort()
  }

  if (order.length !== graph.nodes.size) {
    const remaining = [...graph.nodes.keys()].filter((n) => !order.includes(n))
    throw new CycleError(findCycle(graph, remaining))
  }
  return { order, levels }
}

/**
 * Resolve a user-supplied project reference to a graph node name.
 * Accepts the exact package name, the unscoped name (`api` for `@ex/api`),
 * or the package directory basename. Throws if nothing (or more than one) matches.
 */
export function resolveProjectName(graph: ProjectGraph, input: string): string {
  if (graph.nodes.has(input)) return input
  const byUnscoped = [...graph.nodes.keys()].filter((n) => n.split('/').pop() === input)
  if (byUnscoped.length === 1) return byUnscoped[0]!
  const byDir = [...graph.nodes.values()].filter((p) => basename(p.dir) === input)
  if (byDir.length === 1) return byDir[0]!.name
  if (byUnscoped.length > 1 || byDir.length > 1) {
    throw new Error(`Ambiguous project reference "${input}" — use the full package name.`)
  }
  throw new Error(`Unknown project: ${input}`)
}

/** Return the dependency closure of `targets` (targets + all transitive local deps). */
export function selectWithDeps(graph: ProjectGraph, targets: string[]): Set<string> {
  const selected = new Set<string>()
  const visit = (name: string) => {
    if (selected.has(name)) return
    selected.add(name)
    for (const dep of graph.edges.get(name) ?? []) visit(dep)
  }
  for (const t of targets) {
    if (!graph.nodes.has(t)) throw new Error(`Unknown project: ${t}`)
    visit(t)
  }
  return selected
}

/** Depth-first search to surface a concrete cycle for error messages. */
function findCycle(graph: ProjectGraph, candidates: string[]): string[] {
  const stack: string[] = []
  const onStack = new Set<string>()
  const visited = new Set<string>()

  const dfs = (name: string): string[] | null => {
    if (onStack.has(name)) return [...stack.slice(stack.indexOf(name)), name]
    if (visited.has(name)) return null
    visited.add(name)
    onStack.add(name)
    stack.push(name)
    for (const dep of graph.edges.get(name) ?? []) {
      const found = dfs(dep)
      if (found) return found
    }
    stack.pop()
    onStack.delete(name)
    return null
  }

  for (const c of candidates) {
    const found = dfs(c)
    if (found) return found
  }
  return candidates
}
