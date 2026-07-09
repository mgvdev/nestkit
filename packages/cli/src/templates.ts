import type { ProjectType } from '@mgvdev/nestkit-core'

/** A set of files to write, keyed by path relative to the new package dir. */
export type FileMap = Record<string, string>

export type TestRunner = 'jest' | 'vitest' | 'none'
export type HttpAdapter = 'express' | 'fastify'

export interface AppOptions {
  adapter: HttpAdapter
  test: TestRunner
  service: boolean
  e2e: boolean
  config: boolean
  validation: boolean
}

export const DEFAULT_APP_OPTIONS: AppOptions = {
  adapter: 'express',
  test: 'jest',
  service: true,
  e2e: true,
  config: false,
  validation: false,
}

const j = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`

const NEST = '^10.4.15'

const APP_TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    outDir: 'dist',
    // No rootDir: TS path aliases pull lib sources into the program, and the
    // dts/tsc compilers set rootDir explicitly. Setting it here triggers TS6059.
  },
  include: ['src/**/*.ts', 'test/**/*.ts'],
}

const LIB_TSCONFIG = {
  compilerOptions: { ...APP_TSCONFIG.compilerOptions, declaration: true },
  include: ['src/**/*.ts'],
}

// ── Shared test config/spec builders ────────────────────────────────────────

const JEST_CONFIG = `/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\\\.spec\\\\.ts$',
  transform: { '^.+\\\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
}
`

const JEST_E2E_CONFIG = `${JSON.stringify(
  {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testEnvironment: 'node',
    testRegex: '.e2e-spec.ts$',
    transform: { '^.+\\.ts$': 'ts-jest' },
  },
  null,
  2,
)}\n`

const VITEST_CONFIG = `import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  },
  // SWC keeps decorator metadata so Nest DI works in tests.
  plugins: [swc.vite({ module: { type: 'es6' } })],
})
`

/** Test devDependencies for a runner (with e2e extras when requested). */
function testDeps(runner: TestRunner, e2e: boolean): Record<string, string> {
  if (runner === 'none') return {}
  const base: Record<string, string> =
    runner === 'jest'
      ? { jest: '^29.7.0', 'ts-jest': '^29.2.5', '@types/jest': '^29.5.14' }
      : { vitest: '^2.1.8', 'unplugin-swc': '^1.5.1', '@swc/core': '^1.10.1' }
  const e2eDeps: Record<string, string> = e2e
    ? { supertest: '^7.0.0', '@types/supertest': '^6.0.2' }
    : {}
  return { ...base, '@nestjs/testing': NEST, ...e2eDeps }
}

/** Test scripts for a runner. */
function testScripts(runner: TestRunner, e2e: boolean): Record<string, string> {
  if (runner === 'none') return {}
  if (runner === 'jest') {
    return {
      test: 'jest',
      'test:watch': 'jest --watch',
      'test:cov': 'jest --coverage',
      ...(e2e ? { 'test:e2e': 'jest --config test/jest-e2e.json' } : {}),
    }
  }
  return { test: 'vitest run', 'test:watch': 'vitest' }
}

/** Runner config file(s). */
function testConfigFiles(runner: TestRunner, e2e: boolean): FileMap {
  if (runner === 'jest') {
    return {
      'jest.config.cjs': JEST_CONFIG,
      ...(e2e ? { 'test/jest-e2e.json': JEST_E2E_CONFIG } : {}),
    }
  }
  if (runner === 'vitest') return { 'vitest.config.ts': VITEST_CONFIG }
  return {}
}

// ── App template ────────────────────────────────────────────────────────────

function appMain(name: string, opts: AppOptions): string {
  const bare = name.split('/').pop() ?? name
  const validationImport = opts.validation
    ? "import { ValidationPipe } from '@nestjs/common'\n"
    : ''
  const validationLine = opts.validation
    ? '  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))\n'
    : ''
  if (opts.adapter === 'fastify') {
    return `import 'reflect-metadata'
${validationImport}import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
${validationLine}  await app.listen(process.env.PORT ?? 3000, '0.0.0.0')
  console.log('[${bare}] listening')
}

bootstrap()
`
  }
  return `import 'reflect-metadata'
${validationImport}import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
${validationLine}  await app.listen(process.env.PORT ?? 3000)
  console.log('[${bare}] listening')
}

bootstrap()
`
}

function appModule(opts: AppOptions): string {
  const imports: string[] = ["import { Module } from '@nestjs/common'"]
  if (opts.config) imports.push("import { ConfigModule } from '@nestjs/config'")
  imports.push("import { AppController } from './app.controller'")
  if (opts.service) imports.push("import { AppService } from './app.service'")

  const decoratorLines: string[] = []
  if (opts.config) decoratorLines.push('  imports: [ConfigModule.forRoot({ isGlobal: true })],')
  decoratorLines.push('  controllers: [AppController],')
  if (opts.service) decoratorLines.push('  providers: [AppService],')

  return `${imports.join('\n')}

@Module({
${decoratorLines.join('\n')}
})
export class AppModule {}
`
}

function appController(name: string, opts: AppOptions): string {
  if (opts.service) {
    return `import { Controller, Get } from '@nestjs/common'
import { AppService } from './app.service'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  index(): { message: string } {
    return { message: this.appService.getHello() }
  }
}
`
  }
  return `import { Controller, Get } from '@nestjs/common'

@Controller()
export class AppController {
  @Get()
  index(): { message: string } {
    return { message: 'hello from ${name}' }
  }
}
`
}

function appControllerSpec(): string {
  return `import { Test } from '@nestjs/testing'
import { AppController } from './app.controller'
import { AppService } from './app.service'

describe('AppController', () => {
  let controller: AppController

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile()
    controller = moduleRef.get(AppController)
  })

  it('returns a greeting', () => {
    expect(controller.index().message).toContain('hello')
  })
})
`
}

function appE2eSpec(opts: AppOptions): string {
  const fastify = opts.adapter === 'fastify'
  const header = fastify
    ? `import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'`
    : `import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'`
  const create = fastify
    ? `    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()`
    : `    app = moduleRef.createNestApplication()
    await app.init()`
  const appType = fastify ? 'NestFastifyApplication' : 'INestApplication'
  return `${header}
import request from 'supertest'
import { AppModule } from '../src/app.module'

describe('App (e2e)', () => {
  let app: ${appType}

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
${create}
  })

  afterAll(async () => {
    await app.close()
  })

  it('/ (GET)', () => request(app.getHttpServer()).get('/').expect(200))
})
`
}

function appFiles(name: string, opts: AppOptions): FileMap {
  const bare = name.split('/').pop() ?? name

  const dependencies: Record<string, string> = {
    '@nestjs/common': NEST,
    '@nestjs/core': NEST,
    [`@nestjs/platform-${opts.adapter}`]: NEST,
    'reflect-metadata': '^0.2.2',
    rxjs: '^7.8.1',
  }
  if (opts.config) dependencies['@nestjs/config'] = '^3.3.0'
  if (opts.validation) {
    dependencies['class-validator'] = '^0.14.1'
    dependencies['class-transformer'] = '^0.5.1'
  }

  const files: FileMap = {
    'package.json': j({
      name,
      version: '1.0.0',
      private: true,
      main: './dist/main.js',
      scripts: {
        dev: `nestkit dev ${bare}`,
        build: `nestkit build ${bare}`,
        typecheck: 'nestkit typecheck',
        ...testScripts(opts.test, opts.e2e),
      },
      dependencies,
      devDependencies: { '@types/node': '^22.10.0', ...testDeps(opts.test, opts.e2e) },
    }),
    'nestkit.json': j({ type: 'app', entry: 'src/main.ts' }),
    'tsconfig.json': j(APP_TSCONFIG),
    'src/app.controller.ts': appController(name, opts),
    'src/app.module.ts': appModule(opts),
    'src/main.ts': appMain(name, opts),
    ...testConfigFiles(opts.test, opts.e2e),
  }

  if (opts.service) {
    files['src/app.service.ts'] = `import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
  getHello(): string {
    return 'hello from ${name}'
  }
}
`
    if (opts.test !== 'none') files['src/app.controller.spec.ts'] = appControllerSpec()
  }
  if (opts.e2e && opts.test !== 'none') files['test/app.e2e-spec.ts'] = appE2eSpec(opts)

  if (opts.config) {
    files['.env'] = 'PORT=3000\n'
    files['.env.example'] = 'PORT=3000\n'
  }
  return files
}

// ── Lib template ────────────────────────────────────────────────────────────

/** Convert a package name into a PascalCase base (`@app/user-profile` -> `UserProfile`). */
export function pascalCase(name: string): string {
  const base = name.split('/').pop() ?? name
  return base
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('')
}

/** Convert a name into a kebab-case slug (`UserProfile` / `user profile` -> `user-profile`). */
export function kebabCase(name: string): string {
  const base = name.split('/').pop() ?? name
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .join('-')
    .toLowerCase()
}

export interface LibOptions {
  test: TestRunner
}

function libFiles(name: string, opts: LibOptions): FileMap {
  const base = kebabCase(name)
  const bare = name.split('/').pop() ?? name
  const pascal = pascalCase(name)
  const service = `${pascal}Service`
  const module = `${pascal}Module`

  const files: FileMap = {
    'package.json': j({
      name,
      version: '1.0.0',
      private: true,
      main: './dist/index.js',
      types: './dist/index.d.ts',
      scripts: {
        build: `nestkit build ${bare}`,
        typecheck: 'nestkit typecheck',
        ...testScripts(opts.test, false),
      },
      dependencies: { '@nestjs/common': NEST },
      devDependencies: testDeps(opts.test, false),
    }),
    'nestkit.json': j({ type: 'lib' }),
    'tsconfig.json': j(LIB_TSCONFIG),
    [`src/${base}.service.ts`]: `import { Injectable } from '@nestjs/common'

@Injectable()
export class ${service} {
  hello(): string {
    return 'hello from ${name}'
  }
}
`,
    [`src/${base}.module.ts`]: `import { Module } from '@nestjs/common'
import { ${service} } from './${base}.service'

@Module({
  providers: [${service}],
  exports: [${service}],
})
export class ${module} {}
`,
    'src/index.ts': `export * from './${base}.service'
export * from './${base}.module'
`,
    ...testConfigFiles(opts.test, false),
  }
  if (opts.test !== 'none') {
    files[`src/${base}.service.spec.ts`] = `import { ${service} } from './${base}.service'

describe('${service}', () => {
  it('greets', () => {
    expect(new ${service}().hello()).toContain('hello')
  })
})
`
  }
  return files
}

// ── Frontend template ───────────────────────────────────────────────────────

function frontendFiles(name: string): FileMap {
  return {
    'package.json': j({
      name,
      version: '1.0.0',
      private: true,
      scripts: { dev: 'vite', build: 'vite build' },
      devDependencies: { vite: '^6.0.0' },
    }),
    'nestkit.json': j({ type: 'app-frontend', adapter: 'vite' }),
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    'src/main.ts': `const el = document.getElementById('app')
if (el) el.textContent = 'hello from ${name}'
`,
  }
}

export interface TemplateOptions {
  app?: Partial<AppOptions>
  lib?: Partial<LibOptions>
}

/** Build the file map for a given project kind. */
export function templateFor(kind: ProjectType, name: string, opts?: TemplateOptions): FileMap {
  if (kind === 'app') return appFiles(name, { ...DEFAULT_APP_OPTIONS, ...opts?.app })
  if (kind === 'lib') return libFiles(name, { test: opts?.lib?.test ?? 'jest' })
  return frontendFiles(name)
}
