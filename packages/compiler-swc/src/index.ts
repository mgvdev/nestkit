import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import type { BuildContext, BuildResult, CompilerAdapter } from '@mgvdev/nestkit-core'
import { type Options as SwcOptions, transformFile } from '@swc/core'
import { globSync } from 'tinyglobby'

/** SWC-based transform compiler. Emits CommonJS with decorator metadata for Nest. */
export class SwcCompiler implements CompilerAdapter {
  readonly name = 'swc'

  async build(ctx: BuildContext): Promise<BuildResult> {
    const start = performance.now()
    const { project } = ctx

    const files = globSync('**/*.{ts,tsx,mts,cts}', {
      cwd: project.sourceDir,
      absolute: true,
      ignore: ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
    })

    await Promise.all(files.map((file) => this.transformOne(file, ctx)))
    await this.copyAssets(ctx)

    return {
      outDir: project.outDir,
      durationMs: performance.now() - start,
      fileCount: files.length,
    }
  }

  private async transformOne(file: string, ctx: BuildContext): Promise<void> {
    const { project } = ctx
    const rel = relative(project.sourceDir, file)
    const outFile = join(project.outDir, rel).replace(/\.[cm]?tsx?$/, '.js')
    const mapFile = `${outFile}.map`

    const options: SwcOptions = {
      cwd: project.dir,
      sourceMaps: true,
      sourceFileName: relative(dirname(outFile), file),
      module: { type: 'commonjs' },
      jsc: {
        parser: { syntax: 'typescript', tsx: file.endsWith('tsx'), decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          useDefineForClassFields: false,
        },
        target: 'es2022',
        keepClassNames: true,
        baseUrl: project.dir,
      },
    }

    const output = await transformFile(file, options)
    await mkdir(dirname(outFile), { recursive: true })
    const code = output.map
      ? `${output.code}\n//# sourceMappingURL=${basename(mapFile)}\n`
      : output.code
    await writeFile(outFile, code)
    if (output.map) await writeFile(mapFile, output.map)
  }

  private async copyAssets(ctx: BuildContext): Promise<void> {
    const { project } = ctx
    if (project.assets.length === 0) return
    const matched = globSync(project.assets, {
      cwd: project.dir,
      absolute: true,
      ignore: ['**/node_modules/**'],
    })
    await Promise.all(
      matched.map(async (file) => {
        const under = relative(project.sourceDir, file)
        const rel = under.startsWith('..') ? relative(project.dir, file) : under
        const dest = join(project.outDir, rel)
        await mkdir(dirname(dest), { recursive: true })
        await copyFile(file, dest)
      }),
    )
  }
}

export const swcCompiler = new SwcCompiler()
