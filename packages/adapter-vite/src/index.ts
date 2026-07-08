import { relative } from 'node:path'
import type { BuildContext, BuildResult, Closable, FrontendAdapter } from '@mgvdev/nestkit-core'

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
    const vite = await import('vite')
    const { createServer } = vite

    // In multi-process dev, route Vite's logs through nestkit's labeled sink.
    const customLogger = ctx.emit ? makeViteLogger(vite, ctx.emit) : undefined
    const server = await createServer({ root: ctx.project.dir, customLogger })
    await server.listen()
    if (!ctx.emit) server.printUrls()
    const url = server.resolvedUrls?.local?.[0]
    return {
      url,
      async close() {
        await server.close()
      },
    }
  }
}

/** A Vite logger that forwards messages to nestkit's labeled output sink. */
function makeViteLogger(
  vite: typeof import('vite'),
  emit: (chunk: string, stream: 'out' | 'err') => void,
) {
  const base = vite.createLogger('info', { allowClearScreen: false })
  return {
    ...base,
    info: (msg: string) => emit(`${msg}\n`, 'out'),
    warn: (msg: string) => emit(`${msg}\n`, 'err'),
    warnOnce: (msg: string) => emit(`${msg}\n`, 'err'),
    error: (msg: string) => emit(`${msg}\n`, 'err'),
    clearScreen: () => {},
  }
}

export const viteAdapter = new ViteAdapter()
