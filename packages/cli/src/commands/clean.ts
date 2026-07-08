import { cleanWorkspace } from '@nestkit/core'
import { defineCommand } from 'citty'

export const cleanCommand = defineCommand({
  meta: { name: 'clean', description: 'Remove build outputs (outDir + tsbuildinfo).' },
  args: {
    projects: {
      type: 'positional',
      required: false,
      description: 'Optional project names to clean.',
    },
  },
  async run({ args }) {
    const raw = args.projects
    const targets = Array.isArray(raw) ? raw : raw ? [raw] : undefined
    await cleanWorkspace(process.cwd(), targets)
  },
})
