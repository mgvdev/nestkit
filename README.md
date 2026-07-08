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

## Install

```bash
npm i -D @nestkit/cli @nestkit/core @nestkit/compiler-swc @nestkit/compiler-tsc
# frontend projects:
npm i -D @nestkit/adapter-vite vite
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

## Commands

```bash
nestkit init                     # scaffold nestkit.json for detected packages (dry-run)
nestkit graph [--json]           # print the project graph and build order
nestkit build <project>          # build a project and its local-dep closure
nestkit build --all              # build every managed project
nestkit dev <project>            # build, run and watch with restart on change
nestkit typecheck                # tsc --noEmit across apps + libs
nestkit clean [projects...]      # remove build outputs
nestkit migrate-from-nest-cli    # generate nestkit.json from nest-cli.json (dry-run)
```

Project references accept the full package name (`@ex/api`), the unscoped name (`api`) or the
package directory name.

## Packages

| Package | Role |
| --- | --- |
| `@nestkit/core` | Workspace discovery, project graph, orchestrator, dev runtime, adapter interfaces |
| `@nestkit/cli` | The `nestkit` command |
| `@nestkit/compiler-swc` | Default SWC transform (decorator metadata enabled for Nest DI) |
| `@nestkit/compiler-tsc` | `tsc` typecheck + `.d.ts` generation (and an optional tsc transform) |
| `@nestkit/adapter-vite` | First-class Vite adapter for frontend apps |

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
