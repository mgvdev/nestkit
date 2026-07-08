import { viteAdapter } from '@mgvdev/nestkit-adapter-vite'
import { swcCompiler } from '@mgvdev/nestkit-compiler-swc'
import { tscCompiler, tscDtsBuilder, tscTypeChecker } from '@mgvdev/nestkit-compiler-tsc'
import type { BuildEnv, CompilerAdapter, FrontendAdapter } from '@mgvdev/nestkit-core'

const compilers: Record<string, CompilerAdapter> = {
  swc: swcCompiler,
  tsc: tscCompiler,
}

const frontendAdapters: Record<string, FrontendAdapter> = {
  vite: viteAdapter,
}

/** Wire the built-in adapters into a BuildEnv for the orchestrator. */
export function createBuildEnv(): BuildEnv {
  return {
    getCompiler(name) {
      const compiler = compilers[name]
      if (!compiler) throw new Error(`Unknown compiler: "${name}"`)
      return compiler
    },
    getDtsBuilder: () => tscDtsBuilder,
    getTypeChecker: () => tscTypeChecker,
    getFrontendAdapter(name) {
      const adapter = frontendAdapters[name]
      if (!adapter) throw new Error(`Unknown frontend adapter: "${name}"`)
      return adapter
    },
  }
}
