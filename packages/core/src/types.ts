/** Supported package managers. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** Project kinds nestkit knows how to build. */
export type ProjectType = 'app' | 'lib' | 'app-frontend'

/** Built-in compilers for the transform step. */
export type CompilerName = 'swc' | 'tsc'

/** Raw shape of a per-package `nestkit.json` file. */
export interface NestkitProjectConfig {
  /** Project kind. Required. */
  type: ProjectType
  /** Entry file for apps, relative to the package dir. Default `src/main.ts`. */
  entry?: string
  /** Transform compiler. Default `swc`. */
  compiler?: CompilerName
  /** Output directory, relative to the package dir. Default `dist`. */
  outDir?: string
  /** Source directory, relative to the package dir. Default `src`. */
  sourceDir?: string
  /** Frontend adapter name for `app-frontend` projects. Default `vite`. */
  adapter?: string
  /** Extra glob patterns of non-TS assets to copy into `outDir`. */
  assets?: string[]
  /** tsconfig file, relative to the package dir. Default `tsconfig.json`. */
  tsconfig?: string
  /** Fixed port for `nestkit dev` (apps). Otherwise auto-assigned from a base. */
  devPort?: number
  /** Nest CLI plugins to run at build (SWC can't run them inline): swagger / graphql. */
  nestPlugins?: string[]
}

/** A raw package.json (only the fields nestkit reads). */
export interface PackageJson {
  name?: string
  version?: string
  type?: 'module' | 'commonjs'
  main?: string
  bin?: string | Record<string, string>
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

/** A package discovered in the workspace, before resolution into a Project. */
export interface WorkspacePackage {
  /** package.json `name`. */
  name: string
  /** Absolute path to the package directory. */
  dir: string
  packageJson: PackageJson
  /** Parsed nestkit.json, if present. */
  config: NestkitProjectConfig | null
}

/** The whole discovered workspace. */
export interface Workspace {
  /** Absolute workspace root. */
  root: string
  packageManager: PackageManager
  packages: WorkspacePackage[]
}

/** A fully-resolved project node with defaults applied. */
export interface Project {
  name: string
  dir: string
  /** True when a valid nestkit.json was found (nestkit will compile it). */
  managed: boolean
  type: ProjectType | null
  compiler: CompilerName
  /** Absolute source dir. */
  sourceDir: string
  /** Absolute output dir. */
  outDir: string
  /** Absolute entry file (apps only). */
  entry: string | null
  /** Absolute path of the runnable entry output (apps only), e.g. dist/main.js. */
  entryOut: string | null
  adapter: string | null
  assets: string[]
  /** Fixed dev port for apps, or null to auto-assign. */
  devPort: number | null
  /** Nest CLI plugins to run at build (e.g. ["swagger"]). */
  nestPlugins: string[]
  /** Absolute tsconfig path. */
  tsconfig: string
  packageJson: PackageJson
  /** Names of local (workspace) packages this project depends on. */
  localDeps: string[]
}
