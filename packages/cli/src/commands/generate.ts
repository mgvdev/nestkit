import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import {
  type HttpAdapter,
  type ProjectType,
  c,
  detectPackageManager,
  ensureWorkspaceGlob,
  loadWorkspaceConfig,
  loadWorkspaceGraph,
  logger,
  resolveProjectName,
  syncTsconfigPaths,
} from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'
import {
  type SchematicKind,
  buildSchematic,
  isSchematicKind,
  registerInModule,
} from '../schematics.js'
import {
  type FileMap,
  type TemplateOptions,
  type TestRunner,
  kebabCase,
  templateFor,
} from '../templates.js'

const normalizeTest = (t: string): TestRunner =>
  t === 'vitest' ? 'vitest' : t === 'none' ? 'none' : 'jest'

const VALID_ADAPTERS: HttpAdapter[] = ['express', 'fastify', 'bun']

function defaultAdapter(root: string, pm: string): HttpAdapter {
  const cfg = loadWorkspaceConfig(root)
  if (cfg?.httpAdapter) return cfg.httpAdapter
  return pm === 'bun' ? 'bun' : 'express'
}

function normalizeAdapter(root: string, pm: string, value: string | undefined): HttpAdapter {
  const raw = value ?? defaultAdapter(root, pm)
  if (raw === 'bun' && pm !== 'bun') {
    logger.warn('The Bun adapter is only available when using Bun — falling back to express.')
    return 'express'
  }
  if (VALID_ADAPTERS.includes(raw as HttpAdapter)) return raw as HttpAdapter
  logger.warn(`Unknown adapter "${raw}" — falling back to express.`)
  return 'express'
}

const KINDS: Record<string, ProjectType> = {
  app: 'app',
  lib: 'lib',
  'app-frontend': 'app-frontend',
  frontend: 'app-frontend',
}

const INSTALL_CMD: Record<string, string[]> = {
  npm: ['npm', 'install'],
  pnpm: ['pnpm', 'install'],
  yarn: ['yarn'],
  bun: ['bun', 'install'],
}

/**
 * Build the package-manager-native `create vite` command for a target dir.
 * Without a template, create-vite runs interactively (prompts for framework + variant).
 */
function createViteCmd(pm: string, target: string, template?: string): string[] {
  const base =
    pm === 'pnpm'
      ? ['pnpm', 'create', 'vite', target]
      : pm === 'yarn'
        ? ['yarn', 'create', 'vite', target]
        : pm === 'bun'
          ? ['bun', 'create', 'vite', target]
          : ['npm', 'create', 'vite@latest', target]
  if (!template) return base
  // npm needs `--` to forward flags to create-vite.
  return pm === 'npm' || pm === undefined
    ? [...base, '--', '--template', template]
    : [...base, '--template', template]
}

const normalizeScope = (s: string) => (s.startsWith('@') ? s : `@${s}`)

/** Derive the package name: explicit scope > root scope > default `@package`. */
function resolveName(root: string, name: string, scope?: string): string {
  if (name.startsWith('@')) return name
  const s = normalizeScope(scope ?? rootScope(root) ?? '@package')
  return `${s}/${name}`
}

function rootScope(root: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: string }
    if (pkg.name?.startsWith('@')) return pkg.name.split('/')[0] ?? null
  } catch {
    /* no root package.json */
  }
  return null
}

function writeFiles(files: FileMap, targetDir: string, targetRel: string): void {
  for (const [rel, content] of Object.entries(files)) {
    const dest = join(targetDir, rel)
    logger.log(`  ${c.green('+')} ${join(targetRel, rel)}`)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, content)
  }
}

const NESTKIT_FRONTEND = `${JSON.stringify({ type: 'app-frontend', adapter: 'vite' }, null, 2)}\n`

/** Find the module to register a block in: app.module.ts, else the first *.module.ts. */
function findModuleFile(sourceDir: string): string | null {
  const appModule = join(sourceDir, 'app.module.ts')
  if (existsSync(appModule)) return appModule
  return null
}

/** Handle `generate <module|service|controller|resource|...> <name> --in <project>`. */
function generateBlock(kind: SchematicKind, args: Record<string, any>): void {
  const root = process.cwd()
  const target = args.in
  if (!target) {
    logger.error(`generate ${kind} needs a target app/lib: use --in <project>.`)
    process.exitCode = 1
    return
  }

  const { graph } = loadWorkspaceGraph(root)
  let project: ReturnType<typeof graph.nodes.get>
  try {
    project = graph.nodes.get(resolveProjectName(graph, target))
  } catch (err) {
    logger.error((err as Error).message)
    process.exitCode = 1
    return
  }
  if (!project?.managed) {
    logger.error(`Project "${target}" has no nestkit.json.`)
    process.exitCode = 1
    return
  }

  const slug = kebabCase(args.name)
  const schematic = buildSchematic(kind, args.name)
  const baseDir = args.flat ? project.sourceDir : join(project.sourceDir, slug)

  logger.info(
    `Generating ${c.cyan(kind)} ${c.bold(args.name)} in ${c.dim(relative(root, baseDir))}`,
  )
  for (const [rel, content] of Object.entries(schematic.files)) {
    const dest = join(baseDir, rel)
    logger.log(`  ${c.green('+')} ${relative(root, dest)}`)
    if (!args.dry) {
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, content)
    }
  }

  // Register in the nearest module.
  if (schematic.wire) {
    const moduleFilePath = findModuleFile(project.sourceDir)
    if (moduleFilePath && !args.dry) {
      const importSpecifier = `./${relative(dirname(moduleFilePath), join(baseDir, schematic.wire.file)).split('\\').join('/')}`
      const patched = registerInModule(readFileSync(moduleFilePath, 'utf8'), {
        className: schematic.wire.className,
        importSpecifier,
        key: schematic.wire.key,
      })
      if (patched) {
        writeFileSync(moduleFilePath, patched)
        logger.info(
          `Registered ${c.bold(schematic.wire.className)} in ${relative(root, moduleFilePath)}`,
        )
      } else {
        logger.warn(
          `Add ${schematic.wire.className} to your module's ${schematic.wire.key} manually.`,
        )
      }
    } else if (!moduleFilePath) {
      logger.warn(`No app.module.ts found — add ${schematic.wire.className} to a module manually.`)
    }
  }
  if (schematic.hint) logger.info(schematic.hint)
  if (args.dry) logger.info('Dry run. Re-run without --dry to write these files.')
}

export const generateCommand = defineCommand({
  meta: {
    name: 'generate',
    description:
      'Scaffold a package (app|lib|app-frontend) or a Nest block (module|service|controller|resource|…).',
  },
  args: {
    kind: {
      type: 'positional',
      required: true,
      description: 'app|lib|app-frontend or module|service|controller|resource|guard|pipe|…',
    },
    name: { type: 'positional', required: true, description: 'Package or block name.' },
    in: { type: 'string', description: 'Target project for a Nest block (module/service/…).' },
    flat: { type: 'boolean', description: 'Place block files directly in src (no subfolder).' },
    dir: {
      type: 'string',
      description: 'Workspace dir (default: apps/ for apps, packages/ for libs).',
    },
    scope: { type: 'string', description: 'npm scope, e.g. @app (defaults to the root scope).' },
    template: {
      type: 'string',
      description: 'create-vite template for app-frontend; omit for interactive prompts.',
    },
    adapter: {
      type: 'string',
      description: 'HTTP adapter for apps: express | fastify | bun. Bun is the default under Bun.',
    },
    test: { type: 'string', default: 'jest', description: 'Test runner: jest | vitest | none.' },
    service: { type: 'boolean', default: true, description: 'App: include a service + unit spec.' },
    e2e: { type: 'boolean', default: true, description: 'App: include an e2e test suite.' },
    config: { type: 'boolean', description: 'App: include @nestjs/config + .env.' },
    validation: { type: 'boolean', description: 'App: include class-validator + ValidationPipe.' },
    orpc: { type: 'boolean', description: 'App/lib: scaffold an oRPC contract API (+ Zod).' },
    'orpc-contract': {
      type: 'string',
      description: 'App: npm name of the lib holding the oRPC contract to implement.',
    },
    install: { type: 'boolean', description: 'Run the package manager install afterwards.' },
    dry: { type: 'boolean', description: 'Preview without writing.' },
  },
  run({ args }) {
    // Nest building blocks (module/service/controller/resource/...) go into an existing project.
    if (isSchematicKind(args.kind)) {
      generateBlock(args.kind, args)
      return
    }

    const kind = KINDS[args.kind]
    if (!kind) {
      logger.error(`Unknown kind "${args.kind}". Use: app | lib | app-frontend.`)
      process.exitCode = 1
      return
    }

    const root = process.cwd()
    // Apps live in apps/, libraries in packages/, unless --dir overrides.
    const dir = args.dir ?? (kind === 'lib' ? 'packages' : 'apps')
    const bareName = args.name.startsWith('@') ? (args.name.split('/')[1] ?? args.name) : args.name
    const pkgName = resolveName(root, args.name, args.scope)
    const targetRel = join(dir, bareName)
    const targetDir = join(root, targetRel)

    if (existsSync(targetDir)) {
      logger.error(`Target already exists: ${targetRel}`)
      process.exitCode = 1
      return
    }

    const pm = detectPackageManager(root)

    if (kind === 'app-frontend') {
      // Delegate scaffolding to Vite's official initializer, then wire it into the monorepo.
      // No --template => create-vite prompts interactively for framework + variant.
      const cmd = createViteCmd(pm, targetRel, args.template)
      const mode = args.template ? `template ${c.cyan(args.template)}` : c.cyan('interactive')
      logger.info(`Scaffolding Vite app ${c.bold(bareName)} in ${c.dim(targetRel)} (${mode})`)
      logger.log(`  ${c.dim('$')} ${cmd.join(' ')}`)
      if (args.dry) {
        logger.info(
          'Dry run. Would run create-vite, then add nestkit.json + register the workspace.',
        )
        return
      }
      const res = spawnSync(cmd[0]!, cmd.slice(1), { cwd: root, stdio: 'inherit' })
      if (res.status !== 0 || !existsSync(targetDir)) {
        logger.warn('create-vite did not complete — writing a minimal Vite template instead.')
        writeFiles(templateFor('app-frontend', pkgName), targetDir, targetRel)
      } else {
        writeFileSync(join(targetDir, 'nestkit.json'), NESTKIT_FRONTEND)
        logger.log(`  ${c.green('+')} ${join(targetRel, 'nestkit.json')}`)
      }
    } else {
      logger.info(`Generating ${c.cyan(kind)} ${c.bold(pkgName)} in ${c.dim(targetRel)}`)
      const adapter = normalizeAdapter(root, pm, args.adapter)
      const templateOpts: TemplateOptions = {
        app: {
          adapter,
          test: normalizeTest(args.test),
          service: args.service,
          e2e: args.e2e,
          config: Boolean(args.config),
          validation: Boolean(args.validation),
          orpc: Boolean(args.orpc),
          orpcContract: args['orpc-contract'],
        },
        lib: { test: normalizeTest(args.test), orpc: Boolean(args.orpc) },
      }
      const files = templateFor(kind, pkgName, templateOpts)
      if (args.dry) {
        for (const rel of Object.keys(files))
          logger.log(`  ${c.green('+')} ${join(targetRel, rel)}`)
        logger.info('Dry run. Re-run without --dry to write these files.')
        return
      }
      writeFiles(files, targetDir, targetRel)
    }

    const changed = ensureWorkspaceGlob(root, `${dir}/*`)
    if (changed) logger.info(`Registered ${c.dim(`${dir}/*`)} as a workspace.`)

    // Keep tsconfig path aliases in sync so libs import by name with autocompletion.
    const sync = syncTsconfigPaths(root)
    if (sync.aliases > 0) logger.info(`Updated ${sync.aliases} tsconfig path alias(es).`)

    if (args.install) {
      const cmd = INSTALL_CMD[pm]!
      logger.start(`Running ${cmd.join(' ')}...`)
      const res = spawnSync(cmd[0]!, cmd.slice(1), { cwd: root, stdio: 'inherit' })
      if (res.status !== 0) logger.warn('Install failed — run it manually.')
    } else {
      logger.info(
        `Next: ${c.cyan(INSTALL_CMD[pm]!.join(' '))} then ${c.cyan(`nestkit dev ${bareName}`)}`,
      )
    }
    logger.success(`Created ${pkgName}`)
  },
})
