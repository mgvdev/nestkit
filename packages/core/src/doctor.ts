import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'tinyglobby'
import { buildGraph } from './graph.js'
import { allDependencyNames } from './project.js'
import { resolveProjects } from './project.js'
import { syncTsconfigPaths } from './tsconfig.js'
import type { Project } from './types.js'
import { discoverWorkspace } from './workspace.js'

export interface DoctorFinding {
  level: 'error' | 'warn' | 'info'
  project?: string
  message: string
  /** True when `nestkit doctor --fix` (sync) resolves it. */
  fixable?: boolean
}

function sourceFiles(project: Project): string[] {
  return globSync('**/*.ts', {
    cwd: project.sourceDir,
    absolute: true,
    ignore: ['**/*.d.ts', '**/node_modules/**'],
  })
}

/** Names imported type-only in a file (`import type { X }` or `import { type X }`). */
function typeOnlyImports(src: string): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(/import\s+type\s*\{([^}]*)\}/g)) {
    for (const n of m[1]!.split(',')) {
      const name = n
        .trim()
        .split(/\s+as\s+/)[0]
        ?.trim()
      if (name) names.add(name)
    }
  }
  for (const m of src.matchAll(/import\s*\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const t = part.trim().match(/^type\s+(\w+)/)
      if (t) names.add(t[1]!)
    }
  }
  return names
}

/** Constructor parameter type names in a file. */
function constructorParamTypes(src: string): Set<string> {
  const types = new Set<string>()
  for (const m of src.matchAll(/constructor\s*\(([^)]*)\)/g)) {
    for (const pm of m[1]!.matchAll(/:\s*([A-Z]\w*)/g)) types.add(pm[1]!)
  }
  return types
}

/** Run all diagnostics against the workspace. */
export function runDoctorChecks(root: string): DoctorFinding[] {
  const workspace = discoverWorkspace(root)
  const projects = resolveProjects(workspace)
  const graph = buildGraph(projects)
  const localNames = new Set(graph.nodes.keys())
  const findings: DoctorFinding[] = []

  // TypeScript version (7.x removed the classic compiler API nestkit uses).
  try {
    const tsVer = JSON.parse(
      readFileSync(join(root, 'node_modules/typescript/package.json'), 'utf8'),
    ).version as string
    if (Number.parseInt(tsVer, 10) >= 7) {
      findings.push({
        level: 'error',
        message: `TypeScript ${tsVer} is unsupported for typecheck/.d.ts. Install typescript@">=5 <7".`,
      })
    }
  } catch {
    /* typescript not installed */
  }

  for (const project of projects) {
    // Unmanaged package that looks like a Nest app/lib.
    if (!project.managed) {
      const deps = allDependencyNames(project.packageJson)
      if (deps.some((d) => d.startsWith('@nestjs/'))) {
        findings.push({
          level: 'warn',
          project: project.name,
          message: 'Looks like a Nest package but has no nestkit.json — run `nestkit init`.',
        })
      }
      continue
    }

    const declaredDeps = new Set(allDependencyNames(project.packageJson))

    for (const file of sourceFiles(project)) {
      const src = readFileSync(file, 'utf8')

      // import type on an injected provider → breaks Nest DI.
      const typeOnly = typeOnlyImports(src)
      if (typeOnly.size > 0) {
        const ctorTypes = constructorParamTypes(src)
        for (const name of ctorTypes) {
          if (typeOnly.has(name)) {
            findings.push({
              level: 'error',
              project: project.name,
              message: `${file}: "${name}" is injected but imported with \`import type\` — use a value import (breaks Nest DI).`,
            })
          }
        }
      }

      // Imports a workspace package not declared as a dependency.
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1]!
        const pkg = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0]!
        if (localNames.has(pkg) && pkg !== project.name && !declaredDeps.has(pkg)) {
          findings.push({
            level: 'error',
            project: project.name,
            message: `imports "${pkg}" but doesn't declare it as a dependency — run \`nestkit add ${pkg.split('/').pop()} --to ${project.name.split('/').pop()}\`.`,
          })
        }
      }
    }

    // tsconfig: rootDir present (breaks alias-to-source) → fixable by sync.
    try {
      const cfg = readFileSync(project.tsconfig, 'utf8')
      if (/"rootDir"\s*:/.test(cfg)) {
        findings.push({
          level: 'warn',
          project: project.name,
          message: 'tsconfig sets rootDir — can trip TS6059 on lib imports. Run `nestkit sync`.',
          fixable: true,
        })
      }
    } catch {
      /* no tsconfig */
    }
  }

  // tsconfig.base.json missing while libraries exist → fixable by sync.
  const libs = projects.filter((p) => p.managed && p.type === 'lib')
  if (libs.length > 0 && !existsSync(join(root, 'tsconfig.base.json'))) {
    findings.push({
      level: 'warn',
      message: 'No tsconfig.base.json for library aliases — run `nestkit sync`.',
      fixable: true,
    })
  }

  return findings
}

/** Apply the auto-fixable findings (regenerate tsconfig aliases). */
export function applyDoctorFixes(root: string): void {
  syncTsconfigPaths(root)
}
