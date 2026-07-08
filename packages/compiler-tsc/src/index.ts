import type {
  BuildContext,
  BuildResult,
  CompilerAdapter,
  DtsBuilder,
  Diagnostic as NkDiagnostic,
  Project,
  TypeChecker,
  TypecheckResult,
} from '@nestkit/core'
import ts from 'typescript'

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine,
}

/** Parse a tsconfig.json into compiler options + root file names. */
function parseTsconfig(configPath: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.formatDiagnostic(d, formatHost))
    },
  } as ts.ParseConfigFileHost)
  if (!parsed) throw new Error(`Could not read tsconfig at ${configPath}`)
  return parsed
}

function toNkDiagnostic(d: ts.Diagnostic): NkDiagnostic {
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
    const parsed = parseTsconfig(project.tsconfig)
    const options: ts.CompilerOptions = {
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
        `dts generation failed for ${project.name}:\n${ts.formatDiagnosticsWithColorAndContext(errors, formatHost)}`,
      )
    }
  }
}

/** Type-checks projects with --noEmit semantics via the TypeScript compiler API. */
export class TscTypeChecker implements TypeChecker {
  async check(projects: Project[]): Promise<TypecheckResult> {
    const all: ts.Diagnostic[] = []
    for (const project of projects) {
      const parsed = parseTsconfig(project.tsconfig)
      const options: ts.CompilerOptions = { ...parsed.options, noEmit: true, incremental: false }
      const program = ts.createProgram(parsed.fileNames, options)
      all.push(...ts.getPreEmitDiagnostics(program))
    }
    const errors = all.filter((d) => d.category === ts.DiagnosticCategory.Error)
    return {
      ok: errors.length === 0,
      diagnostics: errors.map(toNkDiagnostic),
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
    const parsed = parseTsconfig(project.tsconfig)
    const options: ts.CompilerOptions = {
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
        `tsc build failed for ${project.name}:\n${ts.formatDiagnosticsWithColorAndContext(errors, formatHost)}`,
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
