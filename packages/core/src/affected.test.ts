import { describe, expect, it } from 'vitest'
import { dependentsOf } from './affected.js'
import { buildGraph } from './graph.js'
import type { Project, ProjectType } from './types.js'

function proj(name: string, localDeps: string[] = []): Project {
  return {
    name,
    dir: `/ws/${name}`,
    managed: true,
    type: 'lib' as ProjectType,
    compiler: 'swc',
    sourceDir: `/ws/${name}/src`,
    outDir: `/ws/${name}/dist`,
    entry: null,
    entryOut: null,
    adapter: null,
    assets: [],
    devPort: null,
    nestPlugins: [],
    tsconfig: `/ws/${name}/tsconfig.json`,
    packageJson: { name },
    localDeps,
  }
}

describe('dependentsOf', () => {
  it('inverts the graph edges', () => {
    // app -> lib -> util
    const g = buildGraph([proj('app', ['lib']), proj('lib', ['util']), proj('util')])
    const dependents = dependentsOf(g)
    expect(dependents.get('util')).toEqual(['lib'])
    expect(dependents.get('lib')).toEqual(['app'])
    expect(dependents.get('app')).toEqual([])
  })
})
