import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { globSync } from 'tinyglobby'
import { parse as parseYaml } from 'yaml'
import { loadProjectConfig } from './config.js'
import type { PackageJson, PackageManager, Workspace, WorkspacePackage } from './types.js'

/**
 * Detect the package manager from lockfiles / config, in priority order.
 * bun > pnpm > yarn > npm, falling back to npm.
 */
export function detectPackageManager(root: string): PackageManager {
  const has = (f: string) => existsSync(join(root, f))
  if (has('bun.lockb') || has('bun.lock')) return 'bun'
  if (has('pnpm-lock.yaml') || has('pnpm-workspace.yaml')) return 'pnpm'
  if (has('yarn.lock')) return 'yarn'
  return 'npm'
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function normalizeWorkspacesField(pkg: PackageJson | null): string[] {
  if (!pkg?.workspaces) return []
  return Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces.packages ?? [])
}

/**
 * Resolve the workspace glob patterns for a package manager.
 * pnpm reads pnpm-workspace.yaml (falling back to package.json#workspaces);
 * npm / yarn / bun read package.json#workspaces.
 */
export function readWorkspaceGlobs(root: string, pm: PackageManager): string[] {
  const rootPkg = readJson<PackageJson>(join(root, 'package.json'))
  if (pm === 'pnpm') {
    const wsFile = join(root, 'pnpm-workspace.yaml')
    if (existsSync(wsFile)) {
      const doc = parseYaml(readFileSync(wsFile, 'utf8')) as { packages?: string[] } | null
      if (doc?.packages?.length) return doc.packages
    }
  }
  return normalizeWorkspacesField(rootPkg)
}

/** Discover every workspace package that has a package.json with a name. */
export function discoverWorkspace(root: string): Workspace {
  const packageManager = detectPackageManager(root)
  const globs = readWorkspaceGlobs(root, packageManager)

  const packages: WorkspacePackage[] = []
  const seen = new Set<string>()

  const pkgJsonPaths = globSync(
    globs.map((g) => `${g.replace(/\/$/, '')}/package.json`),
    { cwd: root, absolute: true, ignore: ['**/node_modules/**'] },
  )

  for (const pkgJsonPath of pkgJsonPaths.sort()) {
    const dir = dirname(pkgJsonPath)
    if (seen.has(dir)) continue
    const packageJson = readJson<PackageJson>(pkgJsonPath)
    if (!packageJson?.name) continue
    seen.add(dir)
    packages.push({
      name: packageJson.name,
      dir,
      packageJson,
      config: loadProjectConfig(dir),
    })
  }

  return { root, packageManager, packages }
}
