import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadWorkspaceConfig, writeWorkspaceConfig } from './workspace-config.js'

function tmpRoot() {
  return `/tmp/nestkit-ws-${Math.random().toString(36).slice(2)}`
}

describe('workspace-config', () => {
  it('returns null when no config exists', () => {
    const cfg = loadWorkspaceConfig(tmpRoot())
    expect(cfg).toBeNull()
  })

  it('round-trips a valid config', () => {
    const root = tmpRoot()
    writeWorkspaceConfig(root, { httpAdapter: 'bun' })
    expect(loadWorkspaceConfig(root)).toEqual({ httpAdapter: 'bun' })
  })

  it('ignores invalid adapter values', () => {
    const root = tmpRoot()
    writeWorkspaceConfig(root, { httpAdapter: 'bun' })
    // Manually corrupt the file.
    writeFileSync(`${root}/nestkit.workspace.json`, '{"httpAdapter":"unknown"}')
    expect(loadWorkspaceConfig(root)).toEqual({})
  })
})
