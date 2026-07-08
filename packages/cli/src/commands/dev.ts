import { dev, logger } from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'
import { createBuildEnv } from '../env.js'

export const devCommand = defineCommand({
  meta: {
    name: 'dev',
    description:
      'Run one or more projects in dev mode (watch + restart). Comma-separated or --all.',
  },
  args: {
    projects: {
      type: 'positional',
      required: false,
      description: 'Project name(s), comma-separated (e.g. api,web).',
    },
    all: { type: 'boolean', description: 'Run every app and app-frontend.' },
    tui: {
      type: 'boolean',
      description: 'Split-panes view (falls back to prefixed lines off a TTY).',
    },
    typecheck: { type: 'boolean', default: true, description: 'Run typecheck out-of-band.' },
  },
  async run({ args, rawArgs }) {
    // Gather targets from the comma list and any extra positionals (`dev api web`).
    const extras = rawArgs.filter((a) => !a.startsWith('-'))
    const raw = [args.projects, ...extras].filter(Boolean).join(',')
    const targets = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    if (!args.all && targets.length === 0) {
      logger.error('Specify project name(s) (e.g. `dev api,web`) or use --all.')
      process.exitCode = 1
      return
    }

    let controller: Awaited<ReturnType<typeof dev>>
    try {
      controller = await dev({
        root: process.cwd(),
        targets,
        all: args.all,
        tui: args.tui,
        typecheck: args.typecheck,
        env: createBuildEnv(),
      })
    } catch (err) {
      logger.error((err as Error).message)
      process.exitCode = 1
      return
    }

    const shutdown = async () => {
      await controller.stop()
      process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    await new Promise(() => {})
  },
})
