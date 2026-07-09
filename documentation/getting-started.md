# Getting Started

## Requirements

- Node.js ≥ 20
- One of: npm, pnpm, Yarn, or Bun (with workspaces)

## Quick start

Scaffold a whole workspace in one command (npm / pnpm / yarn / bun):

```bash
npm create @mgvdev/nestkit my-app
cd my-app
npx nestkit dev api
```

It prompts for an app name, an optional shared library and Vite frontend, a **test runner**
(Jest · Vitest), an **HTTP adapter** (Express · Fastify), app extras (service, e2e, config,
validation), a **linter/formatter** (Biome · ESLint + Prettier · oxlint + oxfmt), and offers to add
packages from the
[mgvdev ecosystem](https://nestjs.mgvdev.io) (`@mgvdev/nest-boost`, `@mgvdev/nestjs-ai`). Selecting
`nest-boost` runs its setup (`nest-boost install`) at the end and adds a `boost` root script.
Non-interactive: `npm create @mgvdev/nestkit my-app -- --yes --lib --linter eslint-prettier --with nestjs-ai`.

### Ecosystem manifest

The offered packages come from a remote manifest at `https://nestjs.mgvdev.io/ecosystem.json`
(falling back to a built-in list when it's unreachable). To add a package to the picker, host that
JSON — no republish of the initializer needed. Schema (see
[`documentation/ecosystem.json`](./ecosystem.json)):

```json
{
  "packages": [
    { "key": "nestjs-ai", "npm": "@mgvdev/nestjs-ai", "target": "app-dep", "desc": "…" }
  ]
}
```

`target` is `app-dep` (added to the app's dependencies) or `root-dev` (root devDependencies).

## Install (manual)

```bash
npm i -D @mgvdev/nestkit-cli @mgvdev/nestkit-core @mgvdev/nestkit-compiler-swc @mgvdev/nestkit-compiler-tsc
# frontend projects:
npm i -D @mgvdev/nestkit-adapter-vite vite
```

Run every command from the **workspace root**, e.g. `npx nestkit <command>`.

## Create a workspace from scratch

```bash
npx nestkit generate app api          # apps/api      — Nest HTTP app
npx nestkit generate lib billing      # packages/billing — Nest library
npx nestkit generate app-frontend web # apps/web      — Vite app (via create-vite)
npx nestkit install                   # install all workspace deps
npx nestkit dev --all                 # run everything in watch mode
```

`generate` registers the workspace globs (`apps/*`, `packages/*`) automatically and scaffolds a
ready-to-run package. Apps default to the `@package` scope (override with `--scope`).

## Adopt nestkit in an existing monorepo

```bash
npx nestkit init          # write a nestkit.json into each detected package (infers type)
npx nestkit sync          # generate tsconfig.base.json aliases so libs import by name
npx nestkit graph         # verify types and build order
npx nestkit build --all
```

Review the generated `nestkit.json` files — correct any `type` / `entry` the inference got wrong.

## Migrating from the Nest CLI monorepo

```bash
npx nestkit migrate-from-nest-cli          # dry run — shows what it would generate
npx nestkit migrate-from-nest-cli --write  # apply
```

See [Migrating from the Nest CLI](./migration.md).

## Wire a library into an app

Types resolve through the alias, but the runtime and build graph need a real dependency:

```bash
npx nestkit add billing --to api   # adds "@package/billing": "*", installs, syncs aliases
```

Then:

```ts
import { BillingModule } from '@package/billing'

@Module({ imports: [BillingModule] })
export class AppModule {}
```

## Everyday commands

```bash
npx nestkit dev api,web    # run several projects, labeled output
npx nestkit build --all    # build in dependency order
npx nestkit typecheck      # tsc --noEmit across apps + libs
npx nestkit clean          # remove build outputs
```
