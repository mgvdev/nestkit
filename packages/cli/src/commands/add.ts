import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  c,
  detectPackageManager,
  loadWorkspaceGraph,
  logger,
  resolveProjectName,
  syncTsconfigPaths,
} from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'

const INSTALL_CMD: Record<string, string[]> = {
  npm: ['npm', 'install'],
  pnpm: ['pnpm', 'install'],
  yarn: ['yarn'],
  bun: ['bun', 'install'],
}

export const addCommand = defineCommand({
  meta: {
    name: 'add',
    description:
      'Add a local library as a dependency of an app (updates package.json, installs, syncs).',
  },
  args: {
    lib: { type: 'positional', required: true, description: 'Library to add (name or short ref).' },
    to: { type: 'string', required: true, description: 'App/project to add it to.' },
    install: { type: 'boolean', default: true, description: 'Run the package manager install.' },
  },
  run({ args }) {
    const root = process.cwd()
    const { graph } = loadWorkspaceGraph(root)

    let libName: string
    let targetName: string
    try {
      libName = resolveProjectName(graph, args.lib)
      targetName = resolveProjectName(graph, args.to)
    } catch (err) {
      logger.error((err as Error).message)
      process.exitCode = 1
      return
    }

    if (libName === targetName) {
      logger.error('A project cannot depend on itself.')
      process.exitCode = 1
      return
    }

    const target = graph.nodes.get(targetName)!
    const pkgPath = join(target.dir, 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    pkg.dependencies ??= {}

    if (pkg.dependencies[libName]) {
      logger.info(`${c.bold(targetName)} already depends on ${c.bold(libName)}.`)
    } else {
      pkg.dependencies[libName] = '*'
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
      logger.success(`Added ${c.bold(libName)} to ${c.bold(targetName)}.`)
    }

    const pm = detectPackageManager(root)
    if (args.install) {
      const cmd = INSTALL_CMD[pm]!
      logger.start(`Running ${cmd.join(' ')}...`)
      const res = spawnSync(cmd[0]!, cmd.slice(1), { cwd: root, stdio: 'inherit' })
      if (res.status !== 0) logger.warn('Install failed — run it manually.')
    }

    const sync = syncTsconfigPaths(root)
    if (sync.aliases > 0) logger.info(`Synced ${sync.aliases} tsconfig path alias(es).`)
    logger.info(`Now import from ${c.cyan(libName)} in ${c.bold(targetName)}.`)
  },
})
