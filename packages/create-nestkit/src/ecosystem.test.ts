import { describe, expect, it } from 'vitest'
import { ecosystemByKeys, FALLBACK_ECOSYSTEM, parseManifest } from './ecosystem.js'

describe('ecosystemByKeys', () => {
  it('resolves by key or npm name and ignores unknown', () => {
    const found = ecosystemByKeys(FALLBACK_ECOSYSTEM, ['nest-boost', '@mgvdev/nestjs-ai', 'nope'])
    expect(found.map((p) => p.npm)).toEqual(['@mgvdev/nest-boost', '@mgvdev/nestjs-ai'])
  })
})

describe('parseManifest', () => {
  it('accepts a bare array of packages', () => {
    const data = [{ key: 'x', npm: '@a/x', target: 'app-dep', desc: 'X' }]
    expect(parseManifest(data)).toEqual(data)
  })
  it('accepts a { packages: [...] } wrapper', () => {
    const pkgs = [{ key: 'x', npm: '@a/x', target: 'root-dev', desc: 'X' }]
    expect(parseManifest({ packages: pkgs })).toEqual(pkgs)
  })
  it('drops invalid entries', () => {
    const data = [
      { key: 'ok', npm: '@a/ok', target: 'app-dep', desc: 'ok' },
      { key: 'bad', npm: 5, target: 'nope', desc: 'bad' },
    ]
    expect(parseManifest(data)?.map((p) => p.key)).toEqual(['ok'])
  })
  it('returns null when unusable', () => {
    expect(parseManifest(null)).toBeNull()
    expect(parseManifest([])).toBeNull()
    expect(parseManifest('nope')).toBeNull()
  })
})
