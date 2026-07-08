import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectPackageManager, discoverWorkspace, readWorkspaceGlobs } from './workspace.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nestkit-ws-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function write(rel: string, content: string) {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content)
}

describe('detectPackageManager', () => {
  it('detects pnpm from pnpm-workspace.yaml', () => {
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
    expect(detectPackageManager(root)).toBe('pnpm')
  })
  it('detects yarn from yarn.lock', () => {
    write('yarn.lock', '')
    expect(detectPackageManager(root)).toBe('yarn')
  })
  it('detects bun from bun.lockb', () => {
    write('bun.lockb', '')
    expect(detectPackageManager(root)).toBe('bun')
  })
  it('falls back to npm', () => {
    write('package.json', '{}')
    expect(detectPackageManager(root)).toBe('npm')
  })
})

describe('readWorkspaceGlobs', () => {
  it('reads pnpm-workspace.yaml for pnpm', () => {
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n  - apps/*\n')
    expect(readWorkspaceGlobs(root, 'pnpm')).toEqual(['packages/*', 'apps/*'])
  })
  it('reads package.json workspaces for npm', () => {
    write('package.json', JSON.stringify({ workspaces: ['packages/*'] }))
    expect(readWorkspaceGlobs(root, 'npm')).toEqual(['packages/*'])
  })
  it('supports the object form of workspaces', () => {
    write('package.json', JSON.stringify({ workspaces: { packages: ['libs/*'] } }))
    expect(readWorkspaceGlobs(root, 'yarn')).toEqual(['libs/*'])
  })
  it('falls back to package.json workspaces for pnpm without yaml', () => {
    write('package.json', JSON.stringify({ workspaces: ['packages/*'] }))
    expect(readWorkspaceGlobs(root, 'pnpm')).toEqual(['packages/*'])
  })
})

describe('discoverWorkspace', () => {
  it('finds named packages and loads their nestkit.json', () => {
    write('package.json', JSON.stringify({ workspaces: ['packages/*'] }))
    write('packages/core/package.json', JSON.stringify({ name: '@app/core' }))
    write('packages/core/nestkit.json', JSON.stringify({ type: 'lib' }))
    write('packages/api/package.json', JSON.stringify({ name: '@app/api' }))
    // no name -> ignored
    write('packages/skip/package.json', JSON.stringify({ version: '1.0.0' }))

    const ws = discoverWorkspace(root)
    expect(ws.packageManager).toBe('npm')
    const names = ws.packages.map((p) => p.name).sort()
    expect(names).toEqual(['@app/api', '@app/core'])
    const core = ws.packages.find((p) => p.name === '@app/core')
    expect(core?.config?.type).toBe('lib')
  })
})
