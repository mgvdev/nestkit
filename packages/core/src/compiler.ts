import type { Project } from './types.js'

/** Context passed to compiler / adapter operations. */
export interface BuildContext {
  project: Project
  /** Absolute workspace root. */
  root: string
  /** True in dev/watch mode (adapters may skip work like dts). */
  watch: boolean
  /**
   * Optional output sink for multi-process dev. When set, adapters route their
   * logs here (labeled + multiplexed) instead of writing straight to stdout.
   */
  emit?: (chunk: string, stream: 'out' | 'err') => void
}

export interface BuildResult {
  outDir: string
  durationMs: number
  fileCount?: number
}

/** A running watcher/process that can be shut down. */
export interface Closable {
  close(): Promise<void>
}

/** Transforms a project's sources into runnable JS in outDir. */
export interface CompilerAdapter {
  readonly name: string
  build(ctx: BuildContext): Promise<BuildResult>
  watch?(ctx: BuildContext, onRebuild: (result: BuildResult) => void): Promise<Closable>
}

/** Emits .d.ts files for a library. Backed by tsc. */
export interface DtsBuilder {
  emitDts(project: Project, root: string): Promise<void>
}

export interface Diagnostic {
  file?: string
  line?: number
  message: string
}

export interface TypecheckResult {
  ok: boolean
  diagnostics: Diagnostic[]
  /** Raw compiler output for display. */
  output: string
}

/** Runs a whole-graph type check (tsc --noEmit / tsc -b). */
export interface TypeChecker {
  check(projects: Project[], root: string): Promise<TypecheckResult>
}

/** Drives a frontend project (Vite, etc). */
export interface FrontendAdapter {
  readonly name: string
  build(ctx: BuildContext): Promise<BuildResult>
  serve(ctx: BuildContext): Promise<Closable & { url?: string }>
}

/**
 * Everything the orchestrator needs to actually compile things.
 * The CLI wires concrete adapters here so core stays free of impl deps.
 */
export interface BuildEnv {
  getCompiler(name: string): CompilerAdapter
  getDtsBuilder(): DtsBuilder
  getTypeChecker(): TypeChecker
  getFrontendAdapter(name: string): FrontendAdapter
}
