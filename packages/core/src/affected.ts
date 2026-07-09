import { execFileSync } from 'node:child_process'
import { sep } from 'node:path'
import type { ProjectGraph } from './graph.js'

/** List files changed since a git ref (tracked diff + untracked), as absolute paths. */
export function changedFilesSince(root: string, since: string): string[] {
  const run = (args: string[]): string[] => {
    const out = execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }
  let tracked: string[]
  try {
    tracked = run(['diff', '--name-only', since])
  } catch (err) {
    throw new Error(`git diff against "${since}" failed: ${(err as Error).message}`)
  }
  let untracked: string[] = []
  try {
    untracked = run(['ls-files', '--others', '--exclude-standard'])
  } catch {
    /* ignore */
  }
  const rootPrefix = root.endsWith(sep) ? root : root + sep
  return [...new Set([...tracked, ...untracked])].map((f) => rootPrefix + f)
}

/** Map project name -> names that depend on it (inverse of graph edges). */
export function dependentsOf(graph: ProjectGraph): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const name of graph.nodes.keys()) map.set(name, [])
  for (const [name, deps] of graph.edges) for (const dep of deps) map.get(dep)?.push(name)
  return map
}

/**
 * Projects affected by changes since a git ref: those containing a changed file,
 * plus everything that transitively depends on them.
 */
export function affectedProjects(graph: ProjectGraph, root: string, since: string): Set<string> {
  const files = changedFilesSince(root, since)
  const directly = new Set<string>()
  for (const project of graph.nodes.values()) {
    const dirPrefix = project.dir.endsWith(sep) ? project.dir : project.dir + sep
    if (files.some((f) => f.startsWith(dirPrefix))) directly.add(project.name)
  }

  const dependents = dependentsOf(graph)
  const affected = new Set(directly)
  const stack = [...directly]
  while (stack.length > 0) {
    const name = stack.pop()!
    for (const dep of dependents.get(name) ?? []) {
      if (!affected.has(dep)) {
        affected.add(dep)
        stack.push(dep)
      }
    }
  }
  return affected
}
