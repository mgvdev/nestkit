import { dev, logger } from '@nestkit/core'
import { defineCommand } from 'citty'
import { createBuildEnv } from '../env.js'

export const devCommand = defineCommand({
  meta: { name: 'dev', description: 'Build, run and watch a project with restart on change.' },
  args: {
    project: {
      type: 'positional',
      required: true,
      description: 'Project name to run in dev mode.',
    },
    typecheck: { type: 'boolean', default: true, description: 'Run typecheck out-of-band.' },
  },
  async run({ args }) {
    const controller = await dev({
      root: process.cwd(),
      target: args.project,
      env: createBuildEnv(),
      typecheck: args.typecheck,
    })

    const shutdown = async () => {
      logger.info('Shutting down...')
      await controller.stop()
      process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    // Keep the event loop alive.
    await new Promise(() => {})
  },
})
