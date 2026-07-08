import { describe, expect, it } from 'vitest'
import { resolveDevTargets } from './dev.js'
import { buildGraph } from './graph.js'
import type { Project, ProjectType } from './types.js'

function proj(name: string, type: ProjectType | null, localDeps: string[] = []): Project {
  return {
    name,
    dir: `/ws/${name}`,
    managed: type !== null,
    type,
    compiler: 'swc',
    sourceDir: `/ws/${name}/src`,
    outDir: `/ws/${name}/dist`,
    entry: type === 'app' ? `/ws/${name}/src/main.ts` : null,
    entryOut: type === 'app' ? `/ws/${name}/dist/main.js` : null,
    adapter: type === 'app-frontend' ? 'vite' : null,
    assets: [],
    tsconfig: `/ws/${name}/tsconfig.json`,
    packageJson: { name },
    localDeps,
  }
}

const graph = buildGraph([
  proj('@app/api', 'app', ['@app/utils']),
  proj('@app/web', 'app-frontend'),
  proj('@app/utils', 'lib'),
])

describe('resolveDevTargets', () => {
  it('selects apps + app-frontends with --all, excluding libs', () => {
    const names = resolveDevTargets(graph, { all: true }).map((p) => p.name)
    expect(names.sort()).toEqual(['@app/api', '@app/web'])
  })

  it('resolves an explicit comma list by short name', () => {
    const names = resolveDevTargets(graph, { targets: ['api', 'web'] }).map((p) => p.name)
    expect(names.sort()).toEqual(['@app/api', '@app/web'])
  })

  it('dedupes repeated targets', () => {
    const names = resolveDevTargets(graph, { targets: ['api', 'api'] }).map((p) => p.name)
    expect(names).toEqual(['@app/api'])
  })

  it('rejects a lib target with a helpful message', () => {
    expect(() => resolveDevTargets(graph, { targets: ['utils'] })).toThrow(/aren't runnable/)
  })

  it('rejects an unknown target', () => {
    expect(() => resolveDevTargets(graph, { targets: ['nope'] })).toThrow(/Unknown project/)
  })

  it('throws when nothing is selected', () => {
    expect(() => resolveDevTargets(graph, {})).toThrow(/No dev targets/)
  })
})
