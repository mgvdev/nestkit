import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_OPTIONS, templateFor } from './templates.js'

function app(overrides: Partial<typeof DEFAULT_APP_OPTIONS> = {}) {
  const files = templateFor('app', '@app/api', { app: { ...DEFAULT_APP_OPTIONS, ...overrides } })
  const pkg = JSON.parse(files['package.json']!)
  return { files, pkg }
}

describe('app template — test runner', () => {
  it('jest: ts-jest deps, jest config, test scripts', () => {
    const { files, pkg } = app({ test: 'jest', e2e: true })
    expect(pkg.devDependencies).toHaveProperty('jest')
    expect(pkg.devDependencies).toHaveProperty('ts-jest')
    expect(pkg.scripts.test).toBe('jest')
    expect(pkg.scripts['test:e2e']).toBe('jest --config test/jest-e2e.json')
    expect(files['jest.config.cjs']).toBeDefined()
    expect(files['test/jest-e2e.json']).toBeDefined()
  })

  it('vitest: unplugin-swc, vitest config, no test:e2e script', () => {
    const { files, pkg } = app({ test: 'vitest' })
    expect(pkg.devDependencies).toHaveProperty('vitest')
    expect(pkg.devDependencies).toHaveProperty('unplugin-swc')
    expect(pkg.scripts.test).toBe('vitest run')
    expect(pkg.scripts['test:e2e']).toBeUndefined()
    expect(files['vitest.config.ts']).toBeDefined()
  })

  it('none: no test deps/scripts/specs', () => {
    const { files, pkg } = app({ test: 'none', service: true, e2e: true })
    expect(pkg.scripts.test).toBeUndefined()
    expect(files['src/app.controller.spec.ts']).toBeUndefined()
    expect(files['test/app.e2e-spec.ts']).toBeUndefined()
  })
})

describe('app template — adapter', () => {
  it('express: platform-express + plain bootstrap', () => {
    const { files, pkg } = app({ adapter: 'express' })
    expect(pkg.dependencies).toHaveProperty('@nestjs/platform-express')
    expect(files['src/main.ts']).not.toContain('FastifyAdapter')
  })
  it('fastify: platform-fastify + FastifyAdapter bootstrap', () => {
    const { files, pkg } = app({ adapter: 'fastify' })
    expect(pkg.dependencies).toHaveProperty('@nestjs/platform-fastify')
    expect(files['src/main.ts']).toContain('new FastifyAdapter()')
  })
  it('bun: nestjs-bun-adapter + BunHttpAdapter bootstrap', () => {
    const { files, pkg } = app({ adapter: 'bun' })
    expect(pkg.dependencies).toHaveProperty('@mgvdev/nestjs-bun-adapter')
    expect(pkg.dependencies).not.toHaveProperty('@nestjs/platform-express')
    expect(files['src/main.ts']).toContain('new BunHttpAdapter()')
    expect(files['nestkit.json']).toContain('"adapter": "bun"')
  })
})

describe('app template — extras', () => {
  it('service: service file + spec + injected controller', () => {
    const { files } = app({ service: true, test: 'jest' })
    expect(files['src/app.service.ts']).toContain('class AppService')
    expect(files['src/app.controller.spec.ts']).toBeDefined()
    expect(files['src/app.controller.ts']).toContain('appService')
  })
  it('config: @nestjs/config + ConfigModule + .env', () => {
    const { files, pkg } = app({ config: true })
    expect(pkg.dependencies).toHaveProperty('@nestjs/config')
    expect(files['src/app.module.ts']).toContain('ConfigModule.forRoot')
    expect(files['.env']).toBeDefined()
  })
  it('validation: class-validator + global ValidationPipe', () => {
    const { files, pkg } = app({ validation: true })
    expect(pkg.dependencies).toHaveProperty('class-validator')
    expect(files['src/main.ts']).toContain('ValidationPipe')
  })

  it('orpc (standalone): @orpc/nest deps, controller, module + bodyParser, local contract', () => {
    const { files, pkg } = app({ orpc: true })
    expect(pkg.dependencies).toHaveProperty('@orpc/nest')
    expect(pkg.dependencies).toHaveProperty('@orpc/contract')
    expect(pkg.dependencies).toHaveProperty('zod')
    expect(files['src/planet.controller.ts']).toContain("from './contract'")
    expect(files['src/contract.ts']).toContain('populateContractRouterPaths')
    expect(files['src/app.module.ts']).toContain('ORPCModule.forRootAsync')
    expect(files['src/main.ts']).toContain('bodyParser: false')
  })

  it('orpc (contract in a lib): imports the lib, no local contract, no @orpc/contract dep', () => {
    const { files, pkg } = app({ orpc: true, orpcContract: '@app/shared' })
    expect(pkg.dependencies).toHaveProperty('@orpc/nest')
    expect(pkg.dependencies).not.toHaveProperty('@orpc/contract')
    expect(files['src/contract.ts']).toBeUndefined()
    expect(files['src/planet.controller.ts']).toContain("from '@app/shared'")
  })
})

describe('lib template — orpc', () => {
  it('ships a contract, exports it, and adds @orpc/contract + zod', () => {
    const files = templateFor('lib', '@app/shared', { lib: { test: 'jest', orpc: true } })
    const pkg = JSON.parse(files['package.json']!)
    expect(pkg.dependencies).toHaveProperty('@orpc/contract')
    expect(pkg.dependencies).toHaveProperty('zod')
    expect(files['src/contract.ts']).toContain('populateContractRouterPaths')
    expect(files['src/index.ts']).toContain("export * from './contract'")
  })
})

describe('lib template', () => {
  it('honors the test runner and ships a spec', () => {
    const files = templateFor('lib', '@app/utils', { lib: { test: 'vitest' } })
    const pkg = JSON.parse(files['package.json']!)
    expect(pkg.scripts.test).toBe('vitest run')
    expect(files['src/utils.service.spec.ts']).toBeDefined()
  })
})
