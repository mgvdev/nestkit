import { kebabCase, pascalCase } from './templates.js'

export type FileMap = Record<string, string>

/** How a generated block should be registered in the nearest module. */
export interface Wiring {
  key: 'providers' | 'controllers' | 'imports'
  className: string
  /** Primary file path (relative to the generation base), used to build the import. */
  file: string
}

export interface Schematic {
  files: FileMap
  wire?: Wiring
  /** Usage note printed when the block isn't auto-registered. */
  hint?: string
}

export const SCHEMATIC_KINDS = [
  'module',
  'service',
  'controller',
  'resource',
  'guard',
  'pipe',
  'interceptor',
  'filter',
  'middleware',
  'decorator',
] as const

export type SchematicKind = (typeof SCHEMATIC_KINDS)[number]

export function isSchematicKind(k: string): k is SchematicKind {
  return (SCHEMATIC_KINDS as readonly string[]).includes(k)
}

/**
 * Register a generated block in a `@Module({...})` source: add the import and
 * insert the class into the right array (creating it if absent). Best-effort
 * string surgery; returns null if no `@Module` decorator is found.
 */
export function registerInModule(
  content: string,
  opts: { className: string; importSpecifier: string; key: Wiring['key'] },
): string | null {
  if (!/@Module\(\{/.test(content)) return null
  // Already registered — leave untouched (idempotent).
  if (new RegExp(`\\b${opts.className}\\b`).test(content)) return content
  let out = content

  {
    const importLine = `import { ${opts.className} } from '${opts.importSpecifier}'`
    const lines = out.split('\n')
    let lastImport = -1
    for (let i = 0; i < lines.length; i++) if (/^import\s/.test(lines[i]!)) lastImport = i
    lines.splice(lastImport + 1, 0, importLine)
    out = lines.join('\n')
  }

  const keyRe = new RegExp(`(${opts.key}\\s*:\\s*\\[)([\\s\\S]*?)(\\])`)
  if (keyRe.test(out)) {
    out = out.replace(keyRe, (_m, open, inner, close) => {
      const items = inner.trim()
      return `${open}${opts.className}${items ? `, ${items}` : ''}${close}`
    })
  } else {
    out = out.replace(/@Module\(\{\s*/, `@Module({\n  ${opts.key}: [${opts.className}],\n  `)
  }
  return out
}

function moduleFile(cls: string): string {
  return `import { Module } from '@nestjs/common'

@Module({})
export class ${cls}Module {}
`
}

function serviceFile(cls: string): string {
  return `import { Injectable } from '@nestjs/common'

@Injectable()
export class ${cls}Service {}
`
}

function controllerFile(slug: string, cls: string, withService: boolean): string {
  return withService
    ? `import { Controller } from '@nestjs/common'
import { ${cls}Service } from './${slug}.service'

@Controller('${slug}')
export class ${cls}Controller {
  constructor(private readonly ${camel(cls)}Service: ${cls}Service) {}
}
`
    : `import { Controller } from '@nestjs/common'

@Controller('${slug}')
export class ${cls}Controller {}
`
}

const camel = (cls: string) => cls[0]!.toLowerCase() + cls.slice(1)

/** Build the schematic (files + wiring) for a kind and name. */
export function buildSchematic(kind: SchematicKind, name: string): Schematic {
  const slug = kebabCase(name)
  const cls = pascalCase(name)

  switch (kind) {
    case 'module':
      return {
        files: { [`${slug}.module.ts`]: moduleFile(cls) },
        wire: { key: 'imports', className: `${cls}Module`, file: `${slug}.module` },
      }
    case 'service':
      return {
        files: { [`${slug}.service.ts`]: serviceFile(cls) },
        wire: { key: 'providers', className: `${cls}Service`, file: `${slug}.service` },
      }
    case 'controller':
      return {
        files: { [`${slug}.controller.ts`]: controllerFile(slug, cls, false) },
        wire: { key: 'controllers', className: `${cls}Controller`, file: `${slug}.controller` },
      }
    case 'resource':
      return {
        files: {
          [`${slug}.service.ts`]: serviceFile(cls),
          [`${slug}.controller.ts`]: controllerFile(slug, cls, true),
          [`${slug}.module.ts`]: `import { Module } from '@nestjs/common'
import { ${cls}Controller } from './${slug}.controller'
import { ${cls}Service } from './${slug}.service'

@Module({
  controllers: [${cls}Controller],
  providers: [${cls}Service],
})
export class ${cls}Module {}
`,
        },
        wire: { key: 'imports', className: `${cls}Module`, file: `${slug}.module` },
      }
    case 'guard':
      return {
        files: {
          [`${slug}.guard.ts`]: `import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common'

@Injectable()
export class ${cls}Guard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true
  }
}
`,
        },
        hint: `Apply with @UseGuards(${cls}Guard).`,
      }
    case 'pipe':
      return {
        files: {
          [`${slug}.pipe.ts`]: `import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common'

@Injectable()
export class ${cls}Pipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    return value
  }
}
`,
        },
        hint: `Apply with @UsePipes(${cls}Pipe).`,
      }
    case 'interceptor':
      return {
        files: {
          [`${slug}.interceptor.ts`]: `import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common'
import type { Observable } from 'rxjs'

@Injectable()
export class ${cls}Interceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle()
  }
}
`,
        },
        hint: `Apply with @UseInterceptors(${cls}Interceptor).`,
      }
    case 'filter':
      return {
        files: {
          [`${slug}.filter.ts`]: `import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'

@Catch()
export class ${cls}Filter implements ExceptionFilter {
  catch(_exception: unknown, _host: ArgumentsHost): void {}
}
`,
        },
        hint: `Apply with @UseFilters(${cls}Filter).`,
      }
    case 'middleware':
      return {
        files: {
          [`${slug}.middleware.ts`]: `import { Injectable, type NestMiddleware } from '@nestjs/common'

@Injectable()
export class ${cls}Middleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    next()
  }
}
`,
        },
        hint: `Register in a module's configure(consumer) method.`,
      }
    case 'decorator':
      return {
        files: {
          [`${slug}.decorator.ts`]: `import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

export const ${cls} = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request
})
`,
        },
        hint: `Use as a parameter decorator: @${cls}().`,
      }
  }
}
