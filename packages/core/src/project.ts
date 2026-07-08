import { join, relative } from 'node:path'
import type { CompilerName, PackageJson, Project, Workspace, WorkspacePackage } from './types.js'

/** All dependency names declared by a package (prod + dev + peer). */
export function allDependencyNames(pkg: PackageJson): string[] {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]
}

/** Map an app entry (src/main.ts) to its compiled output path (dist/main.js). */
function entryOutput(entry: string, sourceDir: string, outDir: string): string {
  const rel = relative(sourceDir, entry).replace(/\.[cm]?tsx?$/, '.js')
  return join(outDir, rel)
}

/** Resolve a discovered package into a Project, applying nestkit.json defaults. */
export function resolveProject(pkg: WorkspacePackage, localNames: Set<string>): Project {
  const cfg = pkg.config
  const managed = cfg !== null
  const sourceDir = join(pkg.dir, cfg?.sourceDir ?? 'src')
  const outDir = join(pkg.dir, cfg?.outDir ?? 'dist')
  const compiler: CompilerName = cfg?.compiler ?? 'swc'
  const type = cfg?.type ?? null

  let entry: string | null = null
  let entryOut: string | null = null
  if (type === 'app') {
    entry = join(pkg.dir, cfg?.entry ?? 'src/main.ts')
    entryOut = entryOutput(entry, sourceDir, outDir)
  }

  const localDeps = allDependencyNames(pkg.packageJson).filter(
    (d) => localNames.has(d) && d !== pkg.name,
  )

  return {
    name: pkg.name,
    dir: pkg.dir,
    managed,
    type,
    compiler,
    sourceDir,
    outDir,
    entry,
    entryOut,
    adapter: type === 'app-frontend' ? (cfg?.adapter ?? 'vite') : null,
    assets: cfg?.assets ?? [],
    tsconfig: join(pkg.dir, cfg?.tsconfig ?? 'tsconfig.json'),
    packageJson: pkg.packageJson,
    localDeps,
  }
}

/** Resolve every package in a workspace into a Project. */
export function resolveProjects(workspace: Workspace): Project[] {
  const localNames = new Set(workspace.packages.map((p) => p.name))
  return workspace.packages.map((p) => resolveProject(p, localNames))
}
