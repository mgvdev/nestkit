import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { type NestkitProjectConfig, c, logger } from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'

interface NestCliProject {
  type?: 'application' | 'library'
  root?: string
  sourceRoot?: string
  entryFile?: string
}

interface NestCliJson {
  sourceRoot?: string
  entryFile?: string
  compilerOptions?: { webpack?: boolean; builder?: string | { type?: string } }
  projects?: Record<string, NestCliProject>
}

/** Translate one nest-cli project entry into a nestkit descriptor + its target dir. */
function mapProject(
  root: string,
  name: string,
  p: NestCliProject,
): { dir: string; config: NestkitProjectConfig } {
  const projectRoot = join(root, p.root ?? '.')
  const type: NestkitProjectConfig['type'] = p.type === 'library' ? 'lib' : 'app'
  const config: NestkitProjectConfig = { type, compiler: 'swc' }
  if (type === 'app') {
    const sourceRoot = join(root, p.sourceRoot ?? join(p.root ?? '.', 'src'))
    const entryAbs = join(sourceRoot, `${p.entryFile ?? 'main'}.ts`)
    config.entry = relative(projectRoot, entryAbs)
  }
  return { dir: projectRoot, config }
}

export const migrateCommand = defineCommand({
  meta: {
    name: 'migrate-from-nest-cli',
    description: 'Generate nestkit.json files from an existing nest-cli.json (dry-run by default).',
  },
  args: {
    write: { type: 'boolean', description: 'Write files instead of just previewing.' },
  },
  run({ args }) {
    const root = process.cwd()
    const nestCliPath = join(root, 'nest-cli.json')
    if (!existsSync(nestCliPath)) {
      logger.error('No nest-cli.json found in the current directory.')
      process.exitCode = 1
      return
    }

    const nestCli = JSON.parse(readFileSync(nestCliPath, 'utf8')) as NestCliJson
    if (nestCli.compilerOptions?.webpack) {
      logger.warn('nest-cli.json uses webpack — nestkit will replace it with SWC (no Webpack).')
    }

    const projects = nestCli.projects
      ? Object.entries(nestCli.projects).map(([name, p]) => ({
          name,
          ...mapProject(root, name, p),
        }))
      : [
          {
            name: 'app',
            ...mapProject(root, 'app', {
              type: 'application',
              root: '.',
              sourceRoot: nestCli.sourceRoot ?? 'src',
              entryFile: nestCli.entryFile,
            }),
          },
        ]

    logger.info(`Found ${projects.length} project(s) in nest-cli.json:`)
    let written = 0
    for (const { name, dir, config } of projects) {
      const file = join(dir, 'nestkit.json')
      const exists = existsSync(file)
      logger.log(
        `  ${exists ? c.yellow('~') : c.green('+')} ${c.bold(name)} → ${relative(root, file)} ${c.dim(JSON.stringify(config))}`,
      )
      if (args.write && !exists) {
        writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
        written++
      }
    }

    if (args.write)
      logger.success(`Wrote ${written} nestkit.json file(s). Review tsconfig references next.`)
    else logger.info('Dry run. Re-run with --write to create these files.')
  },
})
