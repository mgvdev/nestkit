import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { MetadataGenerator, Project } from '@mgvdev/nestkit-core'

/**
 * Resolve and import a module from the user's project root (where the Nest
 * peer deps live), not from wherever this package sits in node_modules.
 */
async function loadFromRoot(root: string, spec: string): Promise<any | null> {
  const require = createRequire(join(root, 'noop.cjs'))
  let resolved: string
  try {
    resolved = require.resolve(spec)
  } catch {
    return null
  }
  return import(pathToFileURL(resolved).href)
}

/** Build the ReadonlyVisitor for a supported Nest plugin, or throw a clear error. */
async function visitorFor(plugin: string, project: Project, root: string): Promise<any> {
  const specs: Record<string, string> = {
    swagger: '@nestjs/swagger/dist/plugin',
    graphql: '@nestjs/graphql/dist/plugin',
  }
  const spec = specs[plugin]
  if (!spec) throw new Error(`Unknown nestPlugin "${plugin}" (supported: swagger, graphql).`)
  const mod = await loadFromRoot(root, spec)
  if (!mod?.ReadonlyVisitor) {
    const pkg = plugin === 'swagger' ? '@nestjs/swagger' : '@nestjs/graphql'
    throw new Error(`nestPlugins: "${plugin}" requires ${pkg} to be installed.`)
  }
  return new mod.ReadonlyVisitor({ introspectComments: true, pathToSource: project.sourceDir })
}

/**
 * Generates Nest CLI plugin metadata (Swagger/GraphQL) into the app's source
 * dir as `metadata.ts`, so the SWC transform compiles it. Load it at bootstrap
 * with e.g. `await SwaggerModule.loadPluginMetadata(metadata)`.
 */
export class NestPluginMetadataGenerator implements MetadataGenerator {
  async generate(project: Project, root: string): Promise<void> {
    if (!project.nestPlugins.length) return

    const cliMod = await loadFromRoot(
      root,
      '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator',
    )
    if (!cliMod?.PluginMetadataGenerator) {
      throw new Error(
        'nestPlugins need @nestjs/cli (for its PluginMetadataGenerator). Install @nestjs/cli.',
      )
    }

    const visitors = []
    for (const plugin of project.nestPlugins) visitors.push(await visitorFor(plugin, project, root))

    const generator = new cliMod.PluginMetadataGenerator()
    generator.generate({
      visitors,
      outputDir: project.sourceDir,
      // PluginMetadataGenerator resolves tsconfigPath relative to cwd (the workspace root).
      tsconfigPath: relative(root, project.tsconfig),
      watch: false,
      printDiagnostics: false,
    })
  }
}

export const nestPluginMetadataGenerator = new NestPluginMetadataGenerator()
