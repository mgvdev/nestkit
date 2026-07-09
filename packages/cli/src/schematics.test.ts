import { describe, expect, it } from 'vitest'
import { buildSchematic, isSchematicKind, registerInModule } from './schematics.js'

describe('isSchematicKind', () => {
  it('recognizes block kinds, not package kinds', () => {
    expect(isSchematicKind('service')).toBe(true)
    expect(isSchematicKind('resource')).toBe(true)
    expect(isSchematicKind('app')).toBe(false)
    expect(isSchematicKind('lib')).toBe(false)
  })
})

describe('buildSchematic', () => {
  it('builds a service with provider wiring and PascalCase class', () => {
    const s = buildSchematic('service', 'user-profile')
    expect(Object.keys(s.files)).toEqual(['user-profile.service.ts'])
    expect(s.files['user-profile.service.ts']).toContain('export class UserProfileService')
    expect(s.wire).toEqual({
      key: 'providers',
      className: 'UserProfileService',
      file: 'user-profile.service',
    })
  })

  it('builds a resource with module/service/controller', () => {
    const s = buildSchematic('resource', 'billing')
    expect(Object.keys(s.files).sort()).toEqual([
      'billing.controller.ts',
      'billing.module.ts',
      'billing.service.ts',
    ])
    expect(s.wire?.key).toBe('imports')
  })

  it('gives a guard a usage hint and no wiring', () => {
    const s = buildSchematic('guard', 'auth')
    expect(s.wire).toBeUndefined()
    expect(s.hint).toMatch(/UseGuards/)
  })
})

describe('registerInModule', () => {
  const mod = `import { Module } from '@nestjs/common'
import { AppController } from './app.controller'

@Module({ controllers: [AppController] })
export class AppModule {}
`

  it('adds a new providers array and import', () => {
    const out = registerInModule(mod, {
      className: 'BillingService',
      importSpecifier: './billing/billing.service',
      key: 'providers',
    })!
    expect(out).toContain("import { BillingService } from './billing/billing.service'")
    expect(out).toMatch(/providers:\s*\[BillingService\]/)
    expect(out).toContain('controllers: [AppController]')
  })

  it('prepends into an existing array', () => {
    const out = registerInModule(mod, {
      className: 'AuthController',
      importSpecifier: './auth/auth.controller',
      key: 'controllers',
    })!
    expect(out).toMatch(/controllers:\s*\[AuthController, AppController\]/)
  })

  it('is idempotent when the class is already present', () => {
    const once = registerInModule(mod, {
      className: 'X',
      importSpecifier: './x',
      key: 'providers',
    })!
    const twice = registerInModule(once, {
      className: 'X',
      importSpecifier: './x',
      key: 'providers',
    })!
    expect(twice.match(/\bX\b/g)?.length).toBe(once.match(/\bX\b/g)?.length)
  })

  it('returns null without a @Module decorator', () => {
    expect(
      registerInModule('export const x = 1', {
        className: 'Y',
        importSpecifier: './y',
        key: 'providers',
      }),
    ).toBeNull()
  })
})
