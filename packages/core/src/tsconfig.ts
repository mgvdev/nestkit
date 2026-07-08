import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveProjects } from './project.js'
import { discoverWorkspace } from './workspace.js'

/** Posix-normalized path relative to root (for tsconfig values). */
function relPosix(root: string, target: string): string {
  return relative(root, target).split('\\').join('/')
}

function readJsonLoose<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

export interface SyncResult {
  baseFile: string
  /** Number of library path aliases written. */
  aliases: number
  /** Package tsconfigs that had `extends` added. */
  extended: string[]
  /** Package tsconfigs skipped (unparseable / already extend something else). */
  skipped: string[]
}

/**
 * Generate TypeScript path aliases so libraries can be imported by name with
 * full autocompletion straight from source — no prior build required.
 *
 * Writes `tsconfig.base.json` at the root with `baseUrl` + `paths` for every
 * managed library, and makes each managed package's tsconfig extend it.
 */
export function syncTsconfigPaths(root: string): SyncResult {
  const projects = resolveProjects(discoverWorkspace(root))
  const libs = projects.filter((p) => p.managed && p.type === 'lib')

  const paths: Record<string, string[]> = {}
  for (const lib of libs) {
    const index = join(lib.sourceDir, 'index.ts')
    paths[lib.name] = [relPosix(root, index)]
    paths[`${lib.name}/*`] = [`${relPosix(root, lib.sourceDir)}/*`]
  }

  // Merge into tsconfig.base.json, preserving any unrelated fields.
  const baseFile = join(root, 'tsconfig.base.json')
  const base = readJsonLoose<Record<string, any>>(baseFile) ?? {}
  base.compilerOptions ??= {}
  base.compilerOptions.baseUrl = '.'
  base.compilerOptions.paths = { ...base.compilerOptions.paths, ...paths }
  writeFileSync(baseFile, `${JSON.stringify(base, null, 2)}\n`)

  // Make each managed package tsconfig extend the base (so aliases apply).
  const extended: string[] = []
  const skipped: string[] = []
  for (const p of projects.filter((x) => x.managed)) {
    if (!existsSync(p.tsconfig)) continue
    const cfg = readJsonLoose<Record<string, any>>(p.tsconfig)
    if (!cfg) {
      skipped.push(p.name)
      continue
    }
    let changed = false

    // rootDir breaks alias-to-source: importing a lib's src pulls files outside the
    // consumer's rootDir (TS6059). The dts/tsc compilers set rootDir explicitly, so it's
    // safe to drop it here.
    if (cfg.compilerOptions && 'rootDir' in cfg.compilerOptions) {
      delete cfg.compilerOptions.rootDir
      changed = true
    }

    const rel = relPosix(p.dir, baseFile)
    if (!cfg.extends) {
      cfg.extends = rel
      changed = true
      extended.push(p.name)
    } else if (cfg.extends !== rel) {
      skipped.push(p.name) // already extends another config — don't touch `extends`
    }

    if (changed) writeFileSync(p.tsconfig, `${JSON.stringify(cfg, null, 2)}\n`)
  }

  return { baseFile, aliases: libs.length, extended, skipped }
}
