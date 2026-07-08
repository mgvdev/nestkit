import { describe, expect, it } from 'vitest'
import { CycleError, buildGraph, resolveProjectName, selectWithDeps, topoSort } from './graph.js'
import type { Project } from './types.js'

function proj(name: string, localDeps: string[] = []): Project {
  return {
    name,
    dir: `/ws/${name}`,
    managed: true,
    type: 'lib',
    compiler: 'swc',
    sourceDir: `/ws/${name}/src`,
    outDir: `/ws/${name}/dist`,
    entry: null,
    entryOut: null,
    adapter: null,
    assets: [],
    tsconfig: `/ws/${name}/tsconfig.json`,
    packageJson: { name },
    localDeps,
  }
}

describe('buildGraph', () => {
  it('keeps only edges that resolve to known nodes', () => {
    const g = buildGraph([proj('a', ['b', 'external']), proj('b')])
    expect(g.edges.get('a')).toEqual(['b'])
    expect(g.edges.get('b')).toEqual([])
  })
})

describe('topoSort', () => {
  it('orders dependencies before dependents', () => {
    // app -> lib -> util
    const g = buildGraph([proj('app', ['lib']), proj('lib', ['util']), proj('util')])
    const { order } = topoSort(g)
    expect(order.indexOf('util')).toBeLessThan(order.indexOf('lib'))
    expect(order.indexOf('lib')).toBeLessThan(order.indexOf('app'))
  })

  it('groups independent nodes into the same level', () => {
    const g = buildGraph([proj('app', ['a', 'b']), proj('a'), proj('b')])
    const { levels } = topoSort(g)
    expect(levels[0]).toEqual(['a', 'b'])
    expect(levels[1]).toEqual(['app'])
  })

  it('throws CycleError on a cycle', () => {
    const g = buildGraph([proj('a', ['b']), proj('b', ['a'])])
    expect(() => topoSort(g)).toThrow(CycleError)
  })
})

describe('selectWithDeps', () => {
  it('returns the transitive dependency closure', () => {
    const g = buildGraph([proj('app', ['lib']), proj('lib', ['util']), proj('util'), proj('other')])
    expect([...selectWithDeps(g, ['app'])].sort()).toEqual(['app', 'lib', 'util'])
  })

  it('throws on unknown target', () => {
    const g = buildGraph([proj('a')])
    expect(() => selectWithDeps(g, ['nope'])).toThrow(/Unknown project/)
  })
})

describe('resolveProjectName', () => {
  it('matches the exact package name', () => {
    const g = buildGraph([proj('@ex/api')])
    expect(resolveProjectName(g, '@ex/api')).toBe('@ex/api')
  })
  it('matches the unscoped name', () => {
    const g = buildGraph([proj('@ex/api'), proj('@ex/logger')])
    expect(resolveProjectName(g, 'api')).toBe('@ex/api')
  })
  it('matches the directory basename', () => {
    // proj() sets dir to /ws/<name>; basename of "/ws/@ex/api" is "api".
    const g = buildGraph([proj('@ex/api')])
    expect(resolveProjectName(g, 'api')).toBe('@ex/api')
  })
  it('throws on unknown reference', () => {
    const g = buildGraph([proj('@ex/api')])
    expect(() => resolveProjectName(g, 'nope')).toThrow(/Unknown project/)
  })
})
