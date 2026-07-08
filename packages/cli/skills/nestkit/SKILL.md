---
name: nestkit
description: Use when working in a NestJS monorepo managed by nestkit (a nestkit.json exists, or the user asks to create/build/run apps and libraries, wire local dependencies, or set up a package-manager-agnostic Nest workspace without the Nest CLI's Webpack monorepo mode). Covers scaffolding, the project graph, dev/build/typecheck, tsconfig aliases, and common gotchas.
---

# nestkit

nestkit is a modern, package-manager-agnostic NestJS **workspace engine**. It replaces the Nest CLI's
Webpack monorepo mode with a package-based project graph, using **SWC** for transforms (no Webpack)
and **tsc** for type checking and `.d.ts` generation. NestJS stays the runtime framework.

Detect a nestkit workspace by a per-package `nestkit.json` and/or `@nestkit/cli` in devDependencies.
Run every command from the **workspace root** with `npx nestkit <cmd>` (or `pnpm/yarn/bun` equivalent).

## Project model

Each managed package has a `nestkit.json`:

```jsonc
{
  "type": "app" | "lib" | "app-frontend",
  "entry": "src/main.ts",   // apps
  "compiler": "swc",        // default; "tsc" also valid
  "outDir": "dist",         // default
  "adapter": "vite",        // app-frontend only
  "assets": ["src/**/*.json"]
}
```

- **app** — a Nest application, transformed by SWC, run as `node dist/main.js`.
- **lib** — a library; builds to `dist/` with `.d.ts`; consumed by name as a built package.
- **app-frontend** — a frontend app driven by the Vite adapter (its own build / dev server + HMR).

The project graph is built from real workspace dependencies: an app that uses `@scope/lib` must list
it in its `package.json` `dependencies`. Layout convention: apps in `apps/`, libraries in `packages/`.

## Commands

```bash
nestkit init                     # generate nestkit.json for detected packages (--dry to preview)
nestkit generate <kind> <name>   # scaffold app | lib | app-frontend (alias: g, new)
nestkit add <lib> --to <app>     # add a local lib as an app dependency (+ install + sync)
nestkit install                  # install all workspace deps via the detected PM (alias: i)
nestkit graph [--json]           # print the project graph and build order
nestkit build <project|--all>    # build a project (+ local-dep closure) or everything
nestkit dev <projects…> | --all  # run app(s)/frontend(s): watch + restart, labeled output
nestkit typecheck                # tsc --noEmit across apps + libs
nestkit sync                     # (re)generate tsconfig.base.json path aliases for libs
nestkit clean [projects…]        # remove build outputs
nestkit migrate-from-nest-cli    # generate nestkit.json from nest-cli.json (--write to apply)
```

Project refs accept the full package name (`@app/api`), the unscoped name (`api`), or the directory
name. `dev` takes a comma or space list (`dev api,web`) or `--all`; add `--tui` for split panes.

## Typical workflows

**New app / lib:**
```bash
nestkit generate app api          # apps/api (@package/api by default)
nestkit generate lib billing      # packages/billing → BillingModule + BillingService + index.ts
nestkit generate app-frontend web # runs create-vite (interactive without --template), then wires it
```

**Use a lib from an app:**
```bash
nestkit add billing --to api      # adds "@package/billing": "*" to apps/api, installs, syncs aliases
```
Then in the app: `import { BillingModule } from '@package/billing'` and add it to `imports: [...]`.

**Run everything in dev:**
```bash
nestkit dev --all                 # or: nestkit dev api,web
```

## Gotchas (fix these when you see them)

- **Nest DI needs value imports.** Never `import type { SomeService }` for a constructor-injected
  provider — the class is erased at runtime and Nest fails with "argument Object at index [0]". Use a
  value import: `import { SomeService } from '…'`. Configure Biome/ESLint so they do NOT rewrite
  provider imports to `import type`.
- **TS6059 "not under rootDir" when importing a lib by alias** → run `nestkit sync`. It maintains
  `tsconfig.base.json` (baseUrl, `rootDir: "."`, and lib `paths`), removes stale aliases, strips
  per-package `rootDir`, and makes each package tsconfig extend the base. Restart the editor's TS
  server afterward.
- **A lib import type-checks but fails at runtime** → the app is missing the lib in its
  `dependencies`; run `nestkit add <lib> --to <app>` (types come from the alias; the runtime needs the
  workspace symlink to the built `dist/`).
- **`moduleResolution: "Node"` deprecation** → use `NodeNext` (generated tsconfigs already do).
- Run `npm install` at the **root**, never inside a sub-package (use `nestkit install`).

## Compatibility

- Package managers: npm, pnpm, Yarn, Bun (auto-detected from the lockfile / `pnpm-workspace.yaml`).
- SWC is the default transform (decorator metadata enabled for Nest DI); tsc does `--noEmit` and lib
  `.d.ts`. Bundling (esbuild/rollup/rolldown) is opt-in, never the default.
