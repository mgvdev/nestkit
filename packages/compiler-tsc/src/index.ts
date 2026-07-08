import type {
  BuildContext,
  BuildResult,
  CompilerAdapter,
  DtsBuilder,
  Diagnostic as NkDiagnostic,
  Project,
  TypeChecker,
  TypecheckResult,
} from '@mgvdev/nestkit-core'
import type TS from 'typescript'

/**
 * Lazily load TypeScript's classic compiler API. Imported on demand (not at
 * module load) so `graph` / `dev` / SWC builds don't require TypeScript, and so
 * an incompatible TypeScript fails with a clear message instead of a cryptic
 * `Cannot read properties of undefined` at import time.
 */
async function loadTs(): Promise<typeof TS> {
  const mod = (await import('typescript')) as unknown as { default?: typeof TS } & typeof TS
  const ts = mod.default ?? mod
  if (!ts?.sys || typeof ts.createProgram !== 'function') {
    throw new Error(
      'nestkit typecheck / .d.ts generation needs the classic TypeScript compiler API ' +
        '(TypeScript 5.x). The resolved "typescript" is incompatible (e.g. 7.x). ' +
        'Install typescript@^5 as a devDependency.',
    )
  }
  return ts
}

function makeFormatHost(ts: typeof TS): TS.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }
}

/** Parse a tsconfig.json into compiler options + root file names. */
function parseTsconfig(ts: typeof TS, configPath: string): TS.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.formatDiagnostic(d, makeFormatHost(ts)))
    },
  } as TS.ParseConfigFileHost)
  if (!parsed) throw new Error(`Could not read tsconfig at ${configPath}`)
  return parsed
}

function toNkDiagnostic(ts: typeof TS, d: TS.Diagnostic): NkDiagnostic {
  const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
  if (d.file && d.start !== undefined) {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start)
    return { file: d.file.fileName, line: line + 1, message }
  }
  return { message }
}

/** Emits declaration files for a library via the TypeScript compiler API. */
export class TscDtsBuilder implements DtsBuilder {
  async emitDts(project: Project): Promise<void> {
    const ts = await loadTs()
    const parsed = parseTsconfig(ts, project.tsconfig)
    const options: TS.CompilerOptions = {
      ...parsed.options,
      declaration: true,
      declarationMap: true,
      emitDeclarationOnly: true,
      noEmit: false,
      outDir: project.outDir,
      rootDir: project.sourceDir,
      composite: false,
      incremental: false,
    }
    const program = ts.createProgram(parsed.fileNames, options)
    const emit = program.emit(undefined, undefined, undefined, /* emitOnlyDtsFiles */ true)
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics)
    const errors = diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error)
    if (errors.length > 0) {
      throw new Error(
        `dts generation failed for ${project.name}:\n${ts.formatDiagnosticsWithColorAndContext(errors, makeFormatHost(ts))}`,
      )
    }
  }
}

/** Type-checks projects with --noEmit semantics via the TypeScript compiler API. */
export class TscTypeChecker implements TypeChecker {
  async check(projects: Project[]): Promise<TypecheckResult> {
    const ts = await loadTs()
    const all: TS.Diagnostic[] = []
    for (const project of projects) {
      const parsed = parseTsconfig(ts, project.tsconfig)
      const options: TS.CompilerOptions = { ...parsed.options, noEmit: true, incremental: false }
      const program = ts.createProgram(parsed.fileNames, options)
      all.push(...ts.getPreEmitDiagnostics(program))
    }
    const errors = all.filter((d) => d.category === ts.DiagnosticCategory.Error)
    const formatHost = makeFormatHost(ts)
    return {
      ok: errors.length === 0,
      diagnostics: errors.map((d) => toNkDiagnostic(ts, d)),
      output: errors.length > 0 ? ts.formatDiagnosticsWithColorAndContext(errors, formatHost) : '',
    }
  }
}

/** Full tsc transform compiler (emits JS + .d.ts). Used when a project opts into `compiler: "tsc"`. */
export class TscCompiler implements CompilerAdapter {
  readonly name = 'tsc'

  async build(ctx: BuildContext): Promise<BuildResult> {
    const start = performance.now()
    const { project } = ctx
    const ts = await loadTs()
    const parsed = parseTsconfig(ts, project.tsconfig)
    const options: TS.CompilerOptions = {
      ...parsed.options,
      outDir: project.outDir,
      rootDir: project.sourceDir,
      noEmit: false,
      emitDeclarationOnly: false,
      declaration: project.type === 'lib',
      declarationMap: project.type === 'lib',
      sourceMap: true,
      composite: false,
      incremental: false,
    }
    const program = ts.createProgram(parsed.fileNames, options)
    const emit = program.emit()
    const errors = ts
      .getPreEmitDiagnostics(program)
      .concat(emit.diagnostics)
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
    if (errors.length > 0) {
      throw new Error(
        `tsc build failed for ${project.name}:\n${ts.formatDiagnosticsWithColorAndContext(errors, makeFormatHost(ts))}`,
      )
    }
    return {
      outDir: project.outDir,
      durationMs: performance.now() - start,
      fileCount: parsed.fileNames.length,
    }
  }
}

export const tscCompiler = new TscCompiler()
export const tscDtsBuilder = new TscDtsBuilder()
export const tscTypeChecker = new TscTypeChecker()
