import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveProjects } from './project.js'
import { discoverWorkspace } from './workspace.js'

/** Posix-normalized path relative to root (for tsconfig values). */
function relPosix(root: string, target: string): string {
  return relative(root, target).split('\\').join('/')
}

/** Parse JSON with comments and trailing commas (tsconfig files often use both). */
function parseJsonc(text: string): unknown {
  let out = ''
  let inStr = false
  let strCh = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const nx = text[i + 1]
    if (inStr) {
      out += ch
      if (ch === '\\') {
        out += nx ?? ''
        i++
      } else if (ch === strCh) {
        inStr = false
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inStr = true
      strCh = ch
      out += ch
      continue
    }
    if (ch === '/' && nx === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (ch === '/' && nx === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
      continue
    }
    out += ch
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

function readJsonLoose<T>(file: string): T | null {
  try {
    return parseJsonc(readFileSync(file, 'utf8')) as T
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

  // Write tsconfig.base.json, preserving unrelated fields but fully regenerating
  // `paths` from the current libraries — so renamed/removed libs don't leave stale
  // aliases behind. tsconfig.base.json's `paths` are owned by nestkit.
  const baseFile = join(root, 'tsconfig.base.json')
  const base = readJsonLoose<Record<string, any>>(baseFile) ?? {}
  base.compilerOptions ??= {}
  base.compilerOptions.baseUrl = '.'
  // rootDir at the workspace root keeps every package's src (and any lib src pulled
  // in via an alias) under a common root, so `declaration`/inferred-rootDir configs
  // don't trip TS6059. The dts/tsc compilers override rootDir per project at build.
  base.compilerOptions.rootDir = '.'
  base.compilerOptions.paths = paths
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
      // Assigning undefined (rather than `delete`) drops the key from JSON output.
      cfg.compilerOptions.rootDir = undefined
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
