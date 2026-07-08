import type { ProjectType } from '@nestkit/core'

/** A set of files to write, keyed by path relative to the new package dir. */
export type FileMap = Record<string, string>

const j = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`

const APP_TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'CommonJS',
    moduleResolution: 'Node',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    outDir: 'dist',
    rootDir: 'src',
  },
  include: ['src/**/*.ts'],
}

const LIB_TSCONFIG = {
  compilerOptions: { ...APP_TSCONFIG.compilerOptions, declaration: true },
  include: ['src/**/*.ts'],
}

function appFiles(name: string): FileMap {
  return {
    'package.json': j({
      name,
      version: '1.0.0',
      private: true,
      main: './dist/main.js',
      dependencies: {
        '@nestjs/common': '^10.4.15',
        '@nestjs/core': '^10.4.15',
        '@nestjs/platform-express': '^10.4.15',
        'reflect-metadata': '^0.2.2',
        rxjs: '^7.8.1',
      },
    }),
    'nestkit.json': j({ type: 'app', entry: 'src/main.ts' }),
    'tsconfig.json': j(APP_TSCONFIG),
    'src/app.controller.ts': `import { Controller, Get } from '@nestjs/common'

@Controller()
export class AppController {
  @Get()
  index(): { message: string } {
    return { message: 'hello from ${name}' }
  }
}
`,
    'src/app.module.ts': `import { Module } from '@nestjs/common'
import { AppController } from './app.controller'

@Module({ controllers: [AppController] })
export class AppModule {}
`,
    'src/main.ts': `import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(process.env.PORT ?? 3000)
  console.log('[${name}] listening')
}

bootstrap()
`,
  }
}

function libFiles(name: string): FileMap {
  const cls = 'ExampleService'
  return {
    'package.json': j({
      name,
      version: '1.0.0',
      private: true,
      main: './dist/index.js',
      types: './dist/index.d.ts',
      dependencies: { '@nestjs/common': '^10.4.15' },
    }),
    'nestkit.json': j({ type: 'lib' }),
    'tsconfig.json': j(LIB_TSCONFIG),
    'src/index.ts': `import { Injectable } from '@nestjs/common'

@Injectable()
export class ${cls} {
  hello(): string {
    return 'hello from ${name}'
  }
}
`,
  }
}

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

/** Build the file map for a given project kind. */
export function templateFor(kind: ProjectType, name: string): FileMap {
  if (kind === 'app') return appFiles(name)
  if (kind === 'lib') return libFiles(name)
  return frontendFiles(name)
}
