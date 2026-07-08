import { relative } from 'node:path'
import type { BuildContext, BuildResult, Closable, FrontendAdapter } from '@nestkit/core'

/** Drives frontend (`app-frontend`) projects through Vite's programmatic API. */
export class ViteAdapter implements FrontendAdapter {
  readonly name = 'vite'

  async build(ctx: BuildContext): Promise<BuildResult> {
    const start = performance.now()
    const { build } = await import('vite')
    await build({
      root: ctx.project.dir,
      configFile: undefined,
      build: { outDir: relative(ctx.project.dir, ctx.project.outDir), emptyOutDir: true },
    })
    return { outDir: ctx.project.outDir, durationMs: performance.now() - start }
  }

  async serve(ctx: BuildContext): Promise<Closable & { url?: string }> {
    const { createServer } = await import('vite')
    const server = await createServer({ root: ctx.project.dir })
    await server.listen()
    server.printUrls()
    const url = server.resolvedUrls?.local?.[0]
    return {
      url,
      async close() {
        await server.close()
      },
    }
  }
}

export const viteAdapter = new ViteAdapter()
