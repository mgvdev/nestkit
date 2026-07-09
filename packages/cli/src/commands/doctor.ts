import {
  type DoctorFinding,
  applyDoctorFixes,
  c,
  logger,
  runDoctorChecks,
} from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'

const mark = (f: DoctorFinding) =>
  f.level === 'error' ? c.red('✗') : f.level === 'warn' ? c.yellow('▲') : c.blue('ℹ')

export const doctorCommand = defineCommand({
  meta: { name: 'doctor', description: 'Diagnose common nestkit / NestJS workspace issues.' },
  args: {
    fix: {
      type: 'boolean',
      description: 'Apply auto-fixable issues (regenerate tsconfig aliases).',
    },
  },
  run({ args }) {
    const root = process.cwd()
    const findings = runDoctorChecks(root)

    if (findings.length === 0) {
      logger.success('No issues found.')
      return
    }

    for (const f of findings) {
      const scope = f.project ? c.bold(`${f.project}: `) : ''
      logger.log(`  ${mark(f)} ${scope}${f.message}`)
    }

    const errors = findings.filter((f) => f.level === 'error').length
    const fixable = findings.filter((f) => f.fixable).length

    if (args.fix && fixable > 0) {
      applyDoctorFixes(root)
      logger.success(
        `Applied ${fixable} fixable issue(s) (nestkit sync). Re-run doctor to confirm.`,
      )
    } else if (fixable > 0) {
      logger.info(`${fixable} issue(s) are auto-fixable — run \`nestkit doctor --fix\`.`)
    }

    logger.info(`${findings.length} issue(s), ${errors} error(s).`)
    if (errors > 0) process.exitCode = 1
  },
})
