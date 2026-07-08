import { describe, expect, it } from 'vitest'
import { ConfigError, validateProjectConfig } from './config.js'

const f = 'nestkit.json'

describe('validateProjectConfig', () => {
  it('accepts a minimal valid config', () => {
    expect(validateProjectConfig({ type: 'lib' }, f)).toEqual({ type: 'lib' })
  })

  it('accepts a full app config', () => {
    const cfg = { type: 'app', entry: 'src/main.ts', compiler: 'swc', outDir: 'build' }
    expect(validateProjectConfig(cfg, f)).toEqual(cfg)
  })

  it('rejects an invalid type', () => {
    expect(() => validateProjectConfig({ type: 'service' }, f)).toThrow(ConfigError)
  })

  it('rejects an invalid compiler', () => {
    expect(() => validateProjectConfig({ type: 'lib', compiler: 'babel' }, f)).toThrow(/compiler/)
  })

  it('rejects non-string entry', () => {
    expect(() => validateProjectConfig({ type: 'app', entry: 5 }, f)).toThrow(/entry/)
  })

  it('rejects non-array assets', () => {
    expect(() => validateProjectConfig({ type: 'lib', assets: 'x' }, f)).toThrow(/assets/)
  })

  it('rejects a non-object', () => {
    expect(() => validateProjectConfig(['lib'], f)).toThrow(/must be a JSON object/)
  })
})
