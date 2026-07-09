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
    inspect: { type: 'boolean', description: 'Attach the Node inspector (distinct port per app).' },
    'inspect-brk': {
      type: 'boolean',
      description: 'Attach the inspector and pause before user code.',
    },
    'port-base': {
      type: 'string',
      description: 'Base port for auto-assigned app ports (default 3000).',
    },
    typecheck: { type: 'boolean', default: true, description: 'Run typecheck out-of-band.' },
  },
  async run({ args, rawArgs }) {
    // Gather targets from the comma list and any extra positionals (`dev api web`).
    // Drop flag values (e.g. the `3100` after `--port-base`) so they aren't treated as targets.
    const flagLike = new Set(['--port-base'])
    const extras: string[] = []
    for (let i = 0; i < rawArgs.length; i++) {
      const a = rawArgs[i]!
      if (a.startsWith('-')) {
        if (flagLike.has(a)) i++ // skip its value
        continue
      }
      extras.push(a)
    }
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

    const portBase = args['port-base'] ? Number(args['port-base']) : undefined

    let controller: Awaited<ReturnType<typeof dev>>
    try {
      controller = await dev({
        root: process.cwd(),
        targets,
        all: args.all,
        tui: args.tui,
        typecheck: args.typecheck,
        inspect: args.inspect,
        inspectBrk: args['inspect-brk'],
        portBase,
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
