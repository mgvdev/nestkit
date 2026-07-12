import type { HttpAdapter, PackageManager } from '@mgvdev/nestkit-core'

export type TestRunner = 'jest' | 'vitest'

export interface AppChoices {
  test: TestRunner
  adapter: HttpAdapter
  service: boolean
  e2e: boolean
  config: boolean
  validation: boolean
}

export function defaultAppChoices(pm: PackageManager): AppChoices {
  return {
    test: 'jest',
    adapter: pm === 'bun' ? 'bun' : 'express',
    service: true,
    e2e: true,
    config: false,
    validation: false,
  }
}

export const EXTRAS = [
  { key: 'service', label: 'Service + unit spec' },
  { key: 'e2e', label: 'End-to-end tests' },
  { key: 'config', label: '@nestjs/config + .env' },
  { key: 'validation', label: 'Validation (class-validator + ValidationPipe)' },
] as const

/** Build the `nestkit generate app` argv for the chosen options. */
export function generateAppArgs(app: string, scope: string, c: AppChoices): string[] {
  return [
    'generate',
    'app',
    app,
    '--scope',
    scope,
    '--adapter',
    c.adapter,
    '--test',
    c.test,
    c.service ? '--service' : '--no-service',
    c.e2e ? '--e2e' : '--no-e2e',
    ...(c.config ? ['--config'] : []),
    ...(c.validation ? ['--validation'] : []),
  ]
}
