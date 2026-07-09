import { describe, expect, it } from 'vitest'
import { ECOSYSTEM, ecosystemByKeys } from './ecosystem.js'

describe('ecosystemByKeys', () => {
  it('resolves by key or npm name and ignores unknown', () => {
    const found = ecosystemByKeys(['nest-boost', '@mgvdev/nestjs-ai', 'nope'])
    expect(found.map((p) => p.npm)).toEqual(['@mgvdev/nest-boost', '@mgvdev/nestjs-ai'])
  })
  it('maps each package to an install target', () => {
    const byNpm = Object.fromEntries(ECOSYSTEM.map((p) => [p.npm, p.target]))
    expect(byNpm['@mgvdev/nest-boost']).toBe('root-dev')
    expect(byNpm['@mgvdev/nestjs-ai']).toBe('app-dep')
  })
})
