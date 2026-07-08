# Troubleshooting

## Nest can't resolve a dependency: "argument Object at index [0]"

Cause: a constructor-injected provider was imported with `import type`, so the class is erased at
runtime and decorator metadata records `Object` instead of the real type.

```ts
// ❌ breaks Nest DI
import type { BillingService } from '@package/billing'
// ✅
import { BillingService } from '@package/billing'
```

Also configure Biome / ESLint so `organizeImports` / `consistent-type-imports` does **not** rewrite
provider imports to `import type`. This is a general NestJS + linter gotcha, not specific to nestkit.

## TS6059: "… is not under 'rootDir'" when importing a lib

The editor pulls a library's source in through an alias, and a `rootDir` (explicit, or inferred from
`declaration` / `composite`) marks it as outside the root.

Fix:
```bash
nestkit sync
```
`sync` sets `rootDir: "."` in `tsconfig.base.json`, removes per-package `rootDir`, and makes each
tsconfig extend the base. Then restart the editor's TypeScript server (VS Code: **TypeScript: Restart
TS Server**). Note `nestkit typecheck` uses `--noEmit` and won't show this error even when the editor
does — the fix is still `nestkit sync`.

## A lib import type-checks but crashes at runtime

Types come from the alias; the runtime needs the built package on disk. Add the dependency and build:

```bash
nestkit add <lib> --to <app>   # writes the dependency, installs, syncs
nestkit build <lib>            # produces dist/ that the app requires at runtime
```

## Autocompletion doesn't work / imports show stale library names

Run `nestkit sync` (it regenerates the aliases and drops renamed/removed libraries), then restart the
TS server. The `paths` in `tsconfig.base.json` are managed by nestkit — don't hand-edit them; put
custom paths in a different tsconfig.

## `moduleResolution: "Node"` is deprecated

Use `NodeNext` (generated tsconfigs already do). It matches the CommonJS runtime, allows extension-less
imports, and respects package `exports`.

## `nestkit graph` shows 0 projects

The workspace globs aren't set or match nothing. Ensure the root has `workspaces`
(`package.json`) or `pnpm-workspace.yaml`, and that packages have a `package.json` `name`.
`nestkit generate` sets the globs for you.

## Per-package `node_modules` under npm

Usually a version conflict, or `npm install` was run inside a sub-package. Install from the root with
`nestkit install`. See [Package Managers → Dependency sharing](./package-managers.md#dependency-sharing-npm-vs-pnpmbun).

## A dev process crashed and didn't come back

In `nestkit dev`, a non-zero exit is logged (`[label] exited with code N`) and the other processes keep
running. Save a file in that project to trigger a rebuild + restart.
