import { describe, expect, it } from 'vitest'
import { LINTERS, isLinterChoice } from './linters.js'

describe('linters', () => {
  it('recognizes valid choices', () => {
    expect(isLinterChoice('biome')).toBe(true)
    expect(isLinterChoice('eslint-prettier')).toBe(true)
    expect(isLinterChoice('oxlint-oxfmt')).toBe(true)
    expect(isLinterChoice('nope')).toBe(false)
  })

  it('each setup has devDeps, a config file and lint/format scripts', () => {
    for (const key of ['biome', 'eslint-prettier', 'oxlint-oxfmt'] as const) {
      const l = LINTERS[key]
      expect(Object.keys(l.devDependencies).length).toBeGreaterThan(0)
      expect(Object.keys(l.files).length).toBeGreaterThan(0)
      expect(l.scripts.lint).toBeTruthy()
      expect(l.scripts.format).toBeTruthy()
    }
  })

  it('maps to the right tools', () => {
    expect(LINTERS.biome.scripts.lint).toBe('biome check .')
    expect(LINTERS['eslint-prettier'].scripts.lint).toBe('eslint .')
    expect(LINTERS['oxlint-oxfmt'].scripts.format).toBe('oxfmt')
    expect(LINTERS['eslint-prettier'].files['eslint.config.mjs']).toContain('typescript-eslint')
  })
})
