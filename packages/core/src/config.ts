import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NestkitProjectConfig, ProjectType } from './types.js'

const PROJECT_TYPES: ProjectType[] = ['app', 'lib', 'app-frontend']
const COMPILERS = ['swc', 'tsc']

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly file: string,
  ) {
    super(`${message} (in ${file})`)
    this.name = 'ConfigError'
  }
}

/** Validate a parsed object as a NestkitProjectConfig. Throws ConfigError on bad input. */
export function validateProjectConfig(raw: unknown, file: string): NestkitProjectConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('nestkit.json must be a JSON object', file)
  }
  const o = raw as Record<string, unknown>

  if (!PROJECT_TYPES.includes(o.type as ProjectType)) {
    throw new ConfigError(`"type" must be one of ${PROJECT_TYPES.join(', ')}`, file)
  }
  if (o.compiler !== undefined && !COMPILERS.includes(o.compiler as string)) {
    throw new ConfigError(`"compiler" must be one of ${COMPILERS.join(', ')}`, file)
  }
  for (const key of ['entry', 'outDir', 'sourceDir', 'adapter', 'tsconfig'] as const) {
    if (o[key] !== undefined && typeof o[key] !== 'string') {
      throw new ConfigError(`"${key}" must be a string`, file)
    }
  }
  if (o.assets !== undefined) {
    if (!Array.isArray(o.assets) || o.assets.some((a) => typeof a !== 'string')) {
      throw new ConfigError('"assets" must be an array of strings', file)
    }
  }
  if (o.devPort !== undefined && (typeof o.devPort !== 'number' || !Number.isInteger(o.devPort))) {
    throw new ConfigError('"devPort" must be an integer', file)
  }
  if (o.nestPlugins !== undefined) {
    if (!Array.isArray(o.nestPlugins) || o.nestPlugins.some((p) => typeof p !== 'string')) {
      throw new ConfigError('"nestPlugins" must be an array of strings', file)
    }
  }
  return o as unknown as NestkitProjectConfig
}

/** Load and validate a package's nestkit.json. Returns null when absent. */
export function loadProjectConfig(dir: string): NestkitProjectConfig | null {
  const file = join(dir, 'nestkit.json')
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new ConfigError(`invalid JSON: ${(err as Error).message}`, file)
  }
  return validateProjectConfig(parsed, file)
}
