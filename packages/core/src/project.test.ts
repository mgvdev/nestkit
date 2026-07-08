import { describe, expect, it } from 'vitest'
import { allDependencyNames, resolveProject } from './project.js'
import type { WorkspacePackage } from './types.js'

function pkg(overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name: '@app/api',
    dir: '/ws/apps/api',
    packageJson: { name: '@app/api' },
    config: null,
    ...overrides,
  }
}

describe('allDependencyNames', () => {
  it('merges prod, dev and peer deps', () => {
    const names = allDependencyNames({
      dependencies: { a: '1' },
      devDependencies: { b: '1' },
      peerDependencies: { c: '1' },
    })
    expect(names.sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('resolveProject', () => {
  it('marks packages without nestkit.json as unmanaged', () => {
    const p = resolveProject(pkg(), new Set(['@app/api']))
    expect(p.managed).toBe(false)
    expect(p.type).toBeNull()
  })

  it('applies defaults for an app', () => {
    const p = resolveProject(pkg({ config: { type: 'app' } }), new Set(['@app/api']))
    expect(p.managed).toBe(true)
    expect(p.compiler).toBe('swc')
    expect(p.entry).toBe('/ws/apps/api/src/main.ts')
    expect(p.entryOut).toBe('/ws/apps/api/dist/main.js')
    expect(p.outDir).toBe('/ws/apps/api/dist')
  })

  it('honors a custom entry and outDir', () => {
    const p = resolveProject(
      pkg({ config: { type: 'app', entry: 'src/bootstrap.ts', outDir: 'build' } }),
      new Set(['@app/api']),
    )
    expect(p.entryOut).toBe('/ws/apps/api/build/bootstrap.js')
  })

  it('detects local deps and excludes external ones', () => {
    const p = resolveProject(
      pkg({
        config: { type: 'app' },
        packageJson: {
          name: '@app/api',
          dependencies: { '@app/core': '*', '@nestjs/common': '^10' },
        },
      }),
      new Set(['@app/api', '@app/core']),
    )
    expect(p.localDeps).toEqual(['@app/core'])
  })

  it('defaults the frontend adapter to vite', () => {
    const p = resolveProject(pkg({ config: { type: 'app-frontend' } }), new Set(['@app/api']))
    expect(p.adapter).toBe('vite')
  })
})
