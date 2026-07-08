import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type NestkitProjectConfig,
  type PackageJson,
  c,
  discoverWorkspace,
  logger,
} from '@mgvdev/nestkit-core'
import { defineCommand } from 'citty'

function hasDep(pkg: PackageJson, name: string): boolean {
  return Boolean(
    pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? pkg.peerDependencies?.[name],
  )
}

/** Infer a project descriptor from a package's shape. */
function inferConfig(dir: string, pkg: PackageJson): NestkitProjectConfig {
  if (hasDep(pkg, 'vite') || hasDep(pkg, 'react') || hasDep(pkg, 'vue')) {
    return { type: 'app-frontend', adapter: 'vite' }
  }
  const isNestApp = hasDep(pkg, '@nestjs/core') && existsSync(join(dir, 'src', 'main.ts'))
  if (isNestApp) return { type: 'app', entry: 'src/main.ts' }
  return { type: 'lib' }
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description:
      'Generate nestkit.json for workspace packages (writes by default; use --dry to preview).',
  },
  args: {
    dry: { type: 'boolean', description: 'Preview changes without writing files.' },
  },
  run({ args }) {
    const ws = discoverWorkspace(process.cwd())
    logger.info(
      `Detected ${c.bold(ws.packageManager)} workspace with ${ws.packages.length} package(s).`,
    )

    let created = 0
    for (const pkg of ws.packages) {
      if (pkg.config) {
        logger.log(`  ${c.dim('skip')} ${pkg.name} (already has nestkit.json)`)
        continue
      }
      const cfg = inferConfig(pkg.dir, pkg.packageJson)
      const file = join(pkg.dir, 'nestkit.json')
      logger.log(`  ${c.green('+')} ${pkg.name} → ${c.cyan(cfg.type)}`)
      if (!args.dry) {
        writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`)
        created++
      }
    }

    if (args.dry) logger.info('Dry run. Re-run without --dry to create these files.')
    else logger.success(`Wrote ${created} nestkit.json file(s).`)
  },
})
