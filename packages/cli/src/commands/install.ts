import { spawnSync } from 'node:child_process'
import { c, detectPackageManager, logger } from '@nestkit/core'
import { defineCommand } from 'citty'

const INSTALL_CMD: Record<string, string[]> = {
  npm: ['npm', 'install'],
  pnpm: ['pnpm', 'install'],
  yarn: ['yarn', 'install'],
  bun: ['bun', 'install'],
}

export const installCommand = defineCommand({
  meta: {
    name: 'install',
    description:
      'Install workspace dependencies for all apps and packages (runs the PM at the root).',
  },
  run({ rawArgs }) {
    const root = process.cwd()
    const pm = detectPackageManager(root)
    // Forward any extra args straight to the package manager (e.g. --frozen-lockfile).
    const cmd = [...INSTALL_CMD[pm]!, ...rawArgs]
    logger.info(`Installing with ${c.bold(pm)} — ${c.dim(cmd.join(' '))}`)
    const res = spawnSync(cmd[0]!, cmd.slice(1), { cwd: root, stdio: 'inherit' })
    if (res.status !== 0) {
      logger.error('Install failed.')
      process.exitCode = res.status ?? 1
      return
    }
    logger.success('Dependencies installed.')
  },
})
