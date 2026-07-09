import { buildWorkspace, logger } from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'
import { createBuildEnv } from '../env.js'

export const buildCommand = defineCommand({
  meta: {
    name: 'build',
    description: 'Build one project (and its local deps), --all, or --affected.',
  },
  args: {
    project: { type: 'positional', required: false, description: 'Project name to build.' },
    all: { type: 'boolean', description: 'Build every managed project.' },
    affected: {
      type: 'string',
      description: 'Build only projects changed since a git ref (+ dependents).',
    },
    'no-cache': { type: 'boolean', description: 'Ignore the content-hash cache.' },
  },
  async run({ args }) {
    const targets = args.project ? [args.project] : []
    if (!args.all && !args.affected && targets.length === 0) {
      logger.error('Specify a project name, --all, or --affected <ref>.')
      process.exitCode = 1
      return
    }
    await buildWorkspace({
      root: process.cwd(),
      targets,
      all: args.all,
      affected: args.affected,
      noCache: args['no-cache'],
      env: createBuildEnv(),
    })
  },
})
