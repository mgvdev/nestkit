import { relative } from 'node:path'
import { c, logger, syncTsconfigPaths } from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'

export const syncCommand = defineCommand({
  meta: {
    name: 'sync',
    description:
      'Generate tsconfig.base.json path aliases so libs import by name with autocompletion.',
  },
  run() {
    const root = process.cwd()
    const res = syncTsconfigPaths(root)
    logger.success(
      `Wrote ${res.aliases} lib alias(es) to ${c.cyan(relative(root, res.baseFile) || 'tsconfig.base.json')}`,
    )
    if (res.extended.length) logger.info(`Extended: ${res.extended.join(', ')}`)
    if (res.skipped.length) {
      logger.warn(
        `Skipped (unparseable or already extend another config): ${res.skipped.join(', ')} — add the extends manually.`,
      )
    }
  },
})
