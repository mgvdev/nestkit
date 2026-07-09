import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EcoPackage } from './ecosystem.js'
import { type PackageManager, installCommand } from './pm.js'

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
function readJson(file: string): any {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Create the target dir, erroring if it exists and is non-empty. */
export function ensureEmptyDir(target: string): void {
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`Target directory "${target}" already exists and is not empty.`)
  }
  mkdirSync(target, { recursive: true })
}

export interface RootOptions {
  name: string
  pm: PackageManager
  frontend: boolean
}

/** Write the workspace root files (package.json, tsconfig.base.json, .gitignore, pnpm-workspace). */
export function writeRootFiles(target: string, opts: RootOptions): void {
  const devDependencies: Record<string, string> = {
    '@mgvdev/nestkit-cli': '^0.2.0',
    typescript: '>=5 <7',
  }
  if (opts.frontend) {
    devDependencies['@mgvdev/nestkit-adapter-vite'] = '^0.2.0'
    devDependencies.vite = '^6.0.0'
  }
  writeJson(join(target, 'package.json'), {
    name: opts.name,
    private: true,
    workspaces: ['apps/*', 'packages/*'],
    devDependencies,
  })
  if (opts.pm === 'pnpm') {
    writeFileSync(
      join(target, 'pnpm-workspace.yaml'),
      'packages:\n  - "apps/*"\n  - "packages/*"\n',
    )
  }
  writeFileSync(
    join(target, 'tsconfig.base.json'),
    `${JSON.stringify({ compilerOptions: { paths: {} } }, null, 2)}\n`,
  )
  writeFileSync(
    join(target, '.gitignore'),
    'node_modules/\ndist/\n.nestkit/\n*.tsbuildinfo\nsrc/metadata.ts\n',
  )
}

/** Run `<pm> install` in the target. */
export function runInstall(pm: PackageManager, target: string): void {
  const cmd = installCommand(pm)
  const res = spawnSync(cmd[0]!, cmd.slice(1), { cwd: target, stdio: 'inherit' })
  if (res.status !== 0) throw new Error(`${cmd.join(' ')} failed`)
}

/** Run the locally-installed nestkit bin with the given args. */
export function runNestkit(target: string, args: string[]): void {
  const bin = join(target, 'node_modules', '.bin', 'nestkit')
  const res = spawnSync(bin, args, { cwd: target, stdio: 'inherit' })
  if (res.status !== 0) throw new Error(`nestkit ${args.join(' ')} failed`)
}

/** Add selected ecosystem packages to the app deps / root devDeps. */
export function applyEcosystem(target: string, appDir: string, packages: EcoPackage[]): void {
  const appDeps = packages.filter((p) => p.target === 'app-dep')
  const rootDev = packages.filter((p) => p.target === 'root-dev')
  if (appDeps.length > 0) {
    const f = join(appDir, 'package.json')
    const j = readJson(f)
    j.dependencies ??= {}
    for (const p of appDeps) j.dependencies[p.npm] = 'latest'
    writeJson(f, j)
  }
  if (rootDev.length > 0) {
    const f = join(target, 'package.json')
    const j = readJson(f)
    j.devDependencies ??= {}
    for (const p of rootDev) j.devDependencies[p.npm] = 'latest'
    writeJson(f, j)
  }
}

/** Initialize a git repo with an initial commit (best-effort). */
export function gitInit(target: string): void {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'nestkit',
    GIT_AUTHOR_EMAIL: 'nestkit@local',
    GIT_COMMITTER_NAME: 'nestkit',
    GIT_COMMITTER_EMAIL: 'nestkit@local',
  }
  try {
    execFileSync('git', ['init', '-q'], { cwd: target })
    execFileSync('git', ['add', '-A'], { cwd: target })
    execFileSync('git', ['commit', '-qm', 'chore: scaffold nestkit workspace'], {
      cwd: target,
      env,
    })
  } catch {
    /* git is optional */
  }
}
