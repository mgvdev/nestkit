import { buildWorkspace, logger } from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'
import { createBuildEnv } from '../env.js'

export const buildCommand = defineCommand({
  meta: { name: 'build', description: 'Build one project (and its local deps) or --all.' },
  args: {
    project: { type: 'positional', required: false, description: 'Project name to build.' },
    all: { type: 'boolean', description: 'Build every managed project.' },
  },
  async run({ args }) {
    const targets = args.project ? [args.project] : []
    if (!args.all && targets.length === 0) {
      logger.error('Specify a project name or use --all.')
      process.exitCode = 1
      return
    }
    await buildWorkspace({ root: process.cwd(), targets, all: args.all, env: createBuildEnv() })
  },
})
