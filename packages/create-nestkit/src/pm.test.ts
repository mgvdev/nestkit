import { describe, expect, it } from 'vitest'
import { detectPackageManager, installCommand } from './pm.js'

describe('detectPackageManager', () => {
  it('detects pnpm/yarn/bun from the user agent', () => {
    expect(detectPackageManager('pnpm/9.0.0 npm/? node/v22')).toBe('pnpm')
    expect(detectPackageManager('yarn/1.22.0 npm/? node/v22')).toBe('yarn')
    expect(detectPackageManager('bun/1.1.0')).toBe('bun')
  })
  it('falls back to npm', () => {
    expect(detectPackageManager('npm/10.0.0 node/v22')).toBe('npm')
    expect(detectPackageManager('')).toBe('npm')
    expect(detectPackageManager('weird/1.0')).toBe('npm')
  })
})

describe('installCommand', () => {
  it('is `yarn` for yarn, `<pm> install` otherwise', () => {
    expect(installCommand('yarn')).toEqual(['yarn'])
    expect(installCommand('npm')).toEqual(['npm', 'install'])
    expect(installCommand('pnpm')).toEqual(['pnpm', 'install'])
    expect(installCommand('bun')).toEqual(['bun', 'install'])
  })
})
