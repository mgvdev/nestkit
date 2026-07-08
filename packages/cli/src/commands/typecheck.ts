import { typecheckWorkspace } from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'
import { createBuildEnv } from '../env.js'

export const typecheckCommand = defineCommand({
  meta: { name: 'typecheck', description: 'Type-check all managed projects with tsc --noEmit.' },
  async run() {
    const ok = await typecheckWorkspace(process.cwd(), createBuildEnv())
    if (!ok) process.exitCode = 1
  },
})
