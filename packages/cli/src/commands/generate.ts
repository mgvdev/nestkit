import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  type ProjectType,
  c,
  detectPackageManager,
  ensureWorkspaceGlob,
  logger,
} from '@nestkit/core'
import { defineCommand } from 'citty'
import { templateFor } from '../templates.js'

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

/** Derive the package name, reusing the root scope unless one is given. */
function resolveName(root: string, name: string, scope?: string): string {
  if (name.startsWith('@')) return name
  const s = scope ?? rootScope(root)
  return s ? `${s}/${name}` : name
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
      default: 'packages',
      description: 'Workspace dir to create the package in.',
    },
    scope: { type: 'string', description: 'npm scope, e.g. @app (defaults to the root scope).' },
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
    const bareName = args.name.startsWith('@') ? (args.name.split('/')[1] ?? args.name) : args.name
    const pkgName = resolveName(root, args.name, args.scope)
    const targetDir = join(root, args.dir, bareName)

    if (existsSync(targetDir)) {
      logger.error(`Target already exists: ${join(args.dir, bareName)}`)
      process.exitCode = 1
      return
    }

    const files = templateFor(kind, pkgName)
    logger.info(
      `Generating ${c.cyan(kind)} ${c.bold(pkgName)} in ${c.dim(join(args.dir, bareName))}`,
    )

    for (const [rel, content] of Object.entries(files)) {
      const dest = join(targetDir, rel)
      logger.log(`  ${c.green('+')} ${join(args.dir, bareName, rel)}`)
      if (!args.dry) {
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, content)
      }
    }

    if (args.dry) {
      logger.info('Dry run. Re-run without --dry to write these files.')
      return
    }

    const changed = ensureWorkspaceGlob(root, `${args.dir}/*`)
    if (changed) logger.info(`Registered ${c.dim(`${args.dir}/*`)} as a workspace.`)

    const pm = detectPackageManager(root)
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
