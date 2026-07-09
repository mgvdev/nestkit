import { describe, expect, it } from 'vitest'
import { type AppChoices, generateAppArgs } from './app-options.js'

const base: AppChoices = {
  test: 'jest',
  adapter: 'express',
  service: true,
  e2e: true,
  config: false,
  validation: false,
}

describe('generateAppArgs', () => {
  it('emits adapter, test, service and e2e flags', () => {
    const a = generateAppArgs('api', '@app', base)
    expect(a.slice(0, 3)).toEqual(['generate', 'app', 'api'])
    expect(a).toEqual(
      expect.arrayContaining(['--adapter', 'express', '--test', 'jest', '--service', '--e2e']),
    )
    expect(a).not.toContain('--config')
    expect(a).not.toContain('--validation')
  })

  it('negates service/e2e and adds config/validation when chosen', () => {
    const a = generateAppArgs('api', '@app', {
      ...base,
      test: 'vitest',
      adapter: 'fastify',
      service: false,
      e2e: false,
      config: true,
      validation: true,
    })
    expect(a).toEqual(
      expect.arrayContaining([
        '--adapter',
        'fastify',
        '--test',
        'vitest',
        '--no-service',
        '--no-e2e',
        '--config',
        '--validation',
      ]),
    )
  })
})
