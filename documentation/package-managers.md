# Package Managers

nestkit is package-manager–agnostic. It detects the PM and adapts workspace discovery and delegated
commands. You don't configure this — it's inferred.

## Detection

In priority order (first match wins):

| Signal | PM |
| --- | --- |
| `bun.lockb` / `bun.lock` | Bun |
| `pnpm-lock.yaml` / `pnpm-workspace.yaml` | pnpm |
| `yarn.lock` | Yarn |
| otherwise | npm |

## Workspace definition

- **npm / Yarn / Bun** — `workspaces` in the root `package.json`:
  ```json
  { "workspaces": ["apps/*", "packages/*"] }
  ```
- **pnpm** — `pnpm-workspace.yaml` (falls back to `package.json#workspaces`):
  ```yaml
  packages:
    - "apps/*"
    - "packages/*"
  ```

`nestkit generate` and `nestkit init` create/extend these automatically.

## Local dependencies

Reference another workspace package by name with any version that resolves locally:

```json
{ "dependencies": { "@package/billing": "*" } }
```

`*` works across all four managers. pnpm/Yarn/Bun also accept `workspace:*`, but `*` keeps the
`package.json` portable. `nestkit add` uses `*`.

## Dependency sharing (npm vs pnpm/Bun)

This surprises people, so to be explicit — all four share dependencies, differently:

- **npm / Yarn** — **hoisting**: compatible dependencies are lifted into the **root** `node_modules`
  and shared by every package. A package only gets its own `node_modules` entry when versions
  conflict. This is flat and normal.
- **pnpm** — a global content-addressable store with symlinks; stricter, less duplication.
- **Bun** — a global cache with links.

If you see per-package `node_modules` under npm, it's usually a version conflict — or you ran
`npm install` **inside** a package. Always install from the **root** (`nestkit install`).

## Installing

```bash
nestkit install            # runs <pm> install at the root — installs the whole workspace
nestkit install <pm-args…> # extra args are forwarded to the package manager
```
