import { typecheckWorkspace } from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'
import { createBuildEnv } from '../env.js'

export const typecheckCommand = defineCommand({
  meta: { name: 'typecheck', description: 'Type-check managed projects with tsc --noEmit.' },
  args: {
    affected: {
      type: 'string',
      description: 'Only type-check projects changed since a git ref (+ dependents).',
    },
  },
  async run({ args }) {
    const ok = await typecheckWorkspace(process.cwd(), createBuildEnv(), args.affected)
    if (!ok) process.exitCode = 1
  },
})
