import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  type ProjectType,
  c,
  detectPackageManager,
  ensureWorkspaceGlob,
  logger,
  syncTsconfigPaths,
} from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'
import { type FileMap, templateFor } from '../templates.js'

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

export const generateCommand = defineCommand({
  meta: {
    name: 'generate',
    description: 'Scaffold a new app, lib or app-frontend package (writes; --dry to preview).',
  },
  args: {
    kind: { type: 'positional', required: true, description: 'app | lib | app-frontend' },
    name: { type: 'positional', required: true, description: 'Package name (bare or scoped).' },
    dir: {
      type: 'string',
      description: 'Workspace dir (default: apps/ for apps, packages/ for libs).',
    },
    scope: { type: 'string', description: 'npm scope, e.g. @app (defaults to the root scope).' },
    template: {
      type: 'string',
      description: 'create-vite template for app-frontend; omit for interactive prompts.',
    },
    install: { type: 'boolean', description: 'Run the package manager install afterwards.' },
    dry: { type: 'boolean', description: 'Preview without writing.' },
  },
  run({ args }) {
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
      const files = templateFor(kind, pkgName)
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
