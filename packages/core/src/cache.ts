import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'tinyglobby'
import type { Project } from './types.js'

/**
 * Content hash of a project's inputs: its source files, `nestkit.json`,
 * `package.json`, tsconfig, and the hashes of its local dependencies (so a
 * dependency change invalidates dependents).
 */
export function hashProject(project: Project, depHashes: Record<string, string>): string {
  const h = createHash('sha256')
  for (const f of [
    join(project.dir, 'nestkit.json'),
    join(project.dir, 'package.json'),
    project.tsconfig,
  ]) {
    try {
      h.update(readFileSync(f))
    } catch {
      /* file may not exist */
    }
  }
  const files = globSync('**/*', {
    cwd: project.sourceDir,
    absolute: true,
    ignore: ['**/node_modules/**'],
  })
  for (const f of files.sort()) {
    try {
      h.update(f)
      h.update(readFileSync(f))
    } catch {
      /* ignore unreadable */
    }
  }
  for (const dep of [...project.localDeps].sort()) h.update(`${dep}:${depHashes[dep] ?? ''}`)
  return h.digest('hex')
}

interface CacheFile {
  version: number
  entries: Record<string, string>
}

const cachePath = (root: string) => join(root, '.nestkit', 'cache.json')

export function loadCache(root: string): Record<string, string> {
  try {
    return (JSON.parse(readFileSync(cachePath(root), 'utf8')) as CacheFile).entries ?? {}
  } catch {
    return {}
  }
}

export function saveCache(root: string, entries: Record<string, string>): void {
  mkdirSync(join(root, '.nestkit'), { recursive: true })
  writeFileSync(cachePath(root), `${JSON.stringify({ version: 1, entries }, null, 2)}\n`)
}

/** True when the project's outputs are present and its hash is unchanged. */
export function isCached(project: Project, hash: string, cache: Record<string, string>): boolean {
  return cache[project.name] === hash && existsSync(project.outDir)
}
