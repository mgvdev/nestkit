# nestkit Documentation

A modern, package-manager–agnostic **NestJS workspace engine**. It replaces the Nest CLI's
Webpack-based monorepo mode with a package-based project graph, using **SWC** for transforms
(no Webpack) and **tsc** for type checking and `.d.ts` generation. NestJS stays your runtime framework.

## Why nestkit

- **Works with npm, pnpm, Yarn and Bun** — detected automatically; no lock-in.
- **SWC without Webpack** — the default transform; `tsc` runs separately for types.
- **Package-based project graph** — apps and libraries wired by real workspace dependencies.
- **Apps, libraries and frontends** — Nest apps, Nest libs, and Vite frontends in one workspace.
- **Progressive migration** — generate `nestkit.json` from an existing `nest-cli.json`.
- **Extensible** — compiler / frontend / bundler adapters; bundling is opt-in, never the default.

## Contents

- [Getting Started](./getting-started.md) — install, scaffold, run.
- [Concepts](./concepts.md) — project graph, build model, tsconfig aliases.
- [Configuration (`nestkit.json`)](./configuration.md) — the per-package descriptor.
- [Commands](./commands.md) — full CLI reference.
- [Package Managers](./package-managers.md) — npm / pnpm / Yarn / Bun specifics.
- [Nest plugins (Swagger/GraphQL under SWC)](./nest-plugins.md).
- [Migrating from the Nest CLI](./migration.md).
- [Troubleshooting](./troubleshooting.md) — DI, aliases, TS6059, and more.

## Packages

| Package | Role |
| --- | --- |
| `@mgvdev/nestkit-cli` | The `nestkit` command |
| `@mgvdev/nestkit-core` | Workspace discovery, project graph, orchestrator, dev runtime, adapter interfaces |
| `@mgvdev/nestkit-compiler-swc` | Default SWC transform (decorator metadata for Nest DI) |
| `@mgvdev/nestkit-compiler-tsc` | `tsc` typecheck + `.d.ts` generation |
| `@mgvdev/nestkit-adapter-vite` | First-class Vite adapter for frontend apps |

## Non-goals

No Webpack. No mandatory bundler (bundling is opt-in). nestkit is not a package manager or publisher —
it orchestrates; your PM installs; changesets (or your tool) publishes.
