import type { BuildContext, BuildResult } from './compiler.js'

/**
 * Optional bundling step (esbuild / rollup / rolldown). Reserved interface —
 * no built-in implementations ship in milestone 1. Bundling is always opt-in;
 * the default pipeline transforms without bundling.
 */
export interface BundlerAdapter {
  readonly name: string
  bundle(ctx: BuildContext): Promise<BuildResult>
}
