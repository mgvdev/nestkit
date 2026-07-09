# nestkit

A modern, package-manager–agnostic **NestJS workspace engine**. It replaces the Nest CLI's
Webpack-based monorepo mode with a package-based project graph, using **SWC** for fast transforms
and **tsc** for type checking and `.d.ts` generation — **no Webpack**.

nestkit keeps NestJS as your runtime framework and takes over discovery, the project graph, build
ordering, dev/watch, typecheck and declaration output.

## Why

- **Works with npm, pnpm, Yarn and Bun** — detected automatically; no lock-in to any one PM.
- **SWC without Webpack** — the default transform. `tsc` runs separately for types.
- **Package-based project graph** — apps and libraries wired by real workspace dependencies.
- **Progressive migration** — generate `nestkit.json` from an existing `nest-cli.json`.
- **Frontend included** — first-class Vite adapter for `app-frontend` projects.
- **Extensible** — compiler / frontend / bundler adapters (bundling is opt-in, never the default).

## Quick start

```bash
npm create nestkit my-app   # scaffolds the workspace, installs Nest, offers ecosystem packages
cd my-app && npx nestkit dev api
```

## Install

```bash
npm i -D @mgvdev/nestkit-cli @mgvdev/nestkit-core @mgvdev/nestkit-compiler-swc @mgvdev/nestkit-compiler-tsc
# frontend projects:
npm i -D @mgvdev/nestkit-adapter-vite vite
```

## Concepts

Each managed package carries a **`nestkit.json`** descriptor:

```jsonc
{
  "type": "app" | "lib" | "app-frontend",
  "entry": "src/main.ts",      // apps
  "compiler": "swc",           // default; "tsc" also supported
  "outDir": "dist",            // default
  "adapter": "vite",           // app-frontend only
  "assets": ["src/**/*.json"]  // optional copy globs
}
```

- **Libraries** build to `dist/` with `.d.ts` and are consumed as built packages; the build order
  is derived from the workspace dependency graph.
- **Apps** are transformed with SWC and run with `node <outDir>/main.js`.
- **Frontend apps** are driven by the Vite adapter (its own build / dev server + HMR).

### Importing libraries (autocompletion)

`nestkit sync` maintains a root `tsconfig.base.json` with `paths` aliases mapping each library to its
source (`@scope/lib` → `packages/lib/src/index.ts`), and makes every package's tsconfig extend it —
so you get **type checking and IDE autocompletion straight from source, no build required**.
`generate` runs it automatically; run `nestkit sync` once in an existing repo to wire it up. For the
app to run, also add the library to its `dependencies` (`"@scope/lib": "*"`) — the runtime resolves
the built `dist/` via the workspace symlink, while types come from the alias.

## Commands

```bash
nestkit init [--dry]             # scaffold nestkit.json for detected packages (writes; --dry to preview)
nestkit generate <kind> <name>   # scaffold a new app | lib | app-frontend package (alias: g, new)
nestkit graph [--json]           # print the project graph and build order
nestkit build <project>          # build a project and its local-dep closure
nestkit build --all              # build every managed project
nestkit add <lib> --to <app>     # add a local lib as an app dependency (+ install + sync)
nestkit install                  # install all workspace deps via the detected PM (alias: i)
nestkit dev <projects…>          # run one or more projects (watch + restart); comma list or --all
nestkit typecheck                # tsc --noEmit across apps + libs
nestkit sync                     # generate tsconfig.base.json path aliases for libs
nestkit clean [projects...]      # remove build outputs
nestkit migrate-from-nest-cli    # generate nestkit.json from nest-cli.json (dry-run)
```

Project references accept the full package name (`@ex/api`), the unscoped name (`api`) or the
package directory name.

## Packages

| Package | Role |
| --- | --- |
| `@mgvdev/nestkit-core` | Workspace discovery, project graph, orchestrator, dev runtime, adapter interfaces |
| `@mgvdev/nestkit-cli` | The `nestkit` command |
| `@mgvdev/nestkit-compiler-swc` | Default SWC transform (decorator metadata enabled for Nest DI) |
| `@mgvdev/nestkit-compiler-tsc` | `tsc` typecheck + `.d.ts` generation (and an optional tsc transform) |
| `@mgvdev/nestkit-adapter-vite` | First-class Vite adapter for frontend apps |

### Scaffolding

`generate` writes a ready-to-run package from built-in templates (no `@nestjs/cli` needed) and
registers the workspace glob if missing:

```bash
nestkit generate app api          # apps/api — Nest HTTP app (built-in template)
nestkit generate lib utils        # packages/utils — Nest library (UtilsModule + UtilsService)
nestkit generate app-frontend web # apps/web — via Vite's own create-vite, then wired in
nestkit g app api --install       # also runs the package manager install
```

`app` and `lib` use built-in templates. A generated **lib** ships a ready NestJS module named after
the package — `generate lib user-profile` creates `UserProfileModule` (which provides and exports
`UserProfileService`) plus a barrel `index.ts` — so consumers just
`imports: [UserProfileModule]`. **`app-frontend` delegates to Vite's official initializer**
(`npm/pnpm/yarn/bun create vite`) and then adds `nestkit.json` and registers the workspace — so you
get the real Vite scaffold, no custom fork. Omit `--template` to run create-vite **interactively**
(it prompts for framework + variant); pass `--template react-ts` (or `vue-ts`, `svelte-ts`, …) for a
non-interactive scaffold.

Apps land in `apps/`, libraries in `packages/` (each glob is registered as a workspace on first
use). Names are scoped `@package/<name>` by default (or the root's scope; override with `--scope`).
Options: `--dir <dir>` (override the target dir), `--scope @foo`, `--template <t>`, `--install`,
`--dry`.

### Wiring a lib into an app

Types work through the alias, but the runtime and the build graph need a real dependency. `nestkit
add` does it in one step:

```bash
nestkit add bird --to api    # adds "@package/bird": "*" to apps/api, installs, syncs aliases
```

Then `import { BirdModule } from '@package/bird'` and add it to your module's `imports`.

### Running several projects at once

`dev` accepts multiple targets and runs each as its own process, with labeled, color-coded output so
the interleaved console stays readable:

```bash
nestkit dev api,web          # comma-separated
nestkit dev api web          # or space-separated
nestkit dev --all            # every app + app-frontend (libs are watched, not run)
nestkit dev api,web --tui    # split-panes view (TTY only; falls back to prefixed lines)
```

Output is prefixed per process (`[api] …`, `[web] …`). Editing a library rebuilds it and restarts
only the apps that depend on it; a process that crashes logs its exit and leaves the others running
(a file change restarts it). Only `app` / `app-frontend` projects are runnable — pointing `dev` at a
lib is an error.

## Documentation

Full docs live in [`documentation/`](./documentation/index.md) — getting started, concepts, the
`nestkit.json` reference, every command, package-manager notes, migration, and troubleshooting.

## Example

See [`examples/monorepo`](./examples/monorepo) — a Nest HTTP app, a local library consumed via DI,
and a Vite frontend, all built and watched by nestkit.

## Development

```bash
npm install
npm run build      # tsc -b (project references)
npm test           # vitest
npm run lint       # biome
```

## Roadmap

Opt-in bundler adapters (`esbuild` / `rollup` / `rolldown`), a Nest plugin, an `oxc` compiler
adapter, and a build cache.

## License

MIT
