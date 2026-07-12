import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HttpAdapter, NestkitWorkspaceConfig } from './types.js'

const VALID_ADAPTERS: HttpAdapter[] = ['express', 'fastify', 'bun']
const WORKSPACE_CONFIG_FILE = 'nestkit.workspace.json'

/** Load and validate the workspace-level config, if present. */
export function loadWorkspaceConfig(root: string): NestkitWorkspaceConfig | null {
  const file = join(root, WORKSPACE_CONFIG_FILE)
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }
  const o = parsed as Record<string, unknown>
  const cfg: NestkitWorkspaceConfig = {}
  if (o.httpAdapter !== undefined) {
    if (VALID_ADAPTERS.includes(o.httpAdapter as HttpAdapter)) {
      cfg.httpAdapter = o.httpAdapter as HttpAdapter
    }
  }
  return cfg
}

/** Write the workspace-level config. */
export function writeWorkspaceConfig(root: string, cfg: NestkitWorkspaceConfig): void {
  const file = join(root, WORKSPACE_CONFIG_FILE)
  mkdirSync(root, { recursive: true })
  writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`)
}
