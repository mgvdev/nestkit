# Concepts

## Workspace discovery

nestkit detects your package manager from lockfiles / config and reads the workspace globs:

- **pnpm** → `pnpm-workspace.yaml` (falls back to `package.json#workspaces`)
- **npm / Yarn / Bun** → `package.json#workspaces`

Every package with a `package.json` `name` is a graph node. A package with a `nestkit.json` is
**managed** (nestkit compiles it); one without is visible to the graph but only run-delegated.

## Project graph

Nodes are workspace packages; edges are **local dependencies** — a dependency whose name matches
another workspace package (from `dependencies` / `devDependencies` / `peerDependencies`). The graph is
topologically sorted to produce build order; independent nodes at the same level build in parallel.
Cycles are reported with the offending path.

```bash
nestkit graph          # tree + build levels
nestkit graph --json   # machine-readable
```

The graph is the source of truth for build order and for what `dev` watches. **This is why an app
that uses a library must declare it as a dependency** — that edge is what nestkit follows.

## Build model

- **Transform** — SWC turns TypeScript into JavaScript, fast, with decorator metadata enabled for
  Nest DI. It never type-checks.
- **Type check** — `tsc --noEmit` runs separately (`nestkit typecheck`).
- **Declarations** — libraries emit `.d.ts` via `tsc --emitDeclarationOnly` at build time.

### Libraries: built `dist/` + project references

A library builds to `dist/` (JS + `.d.ts`) and is consumed by name as a built package — the same
semantics as a published package. Build order comes from the dependency graph. In dev, a library's
sources are watched and rebuilt on change, and the apps that depend on it restart.

## Two resolution levels (important)

| Concern | Mechanism | Needs a build? |
| --- | --- | --- |
| Types / IDE autocompletion | tsconfig `paths` alias → the lib's **source** | No |
| Runtime (`require('@scope/lib')`) | workspace symlink → the lib's **built `dist/`** | Yes |

`nestkit sync` maintains the aliases; `nestkit add` (and declaring the dependency) provides the
runtime symlink. See [Troubleshooting](./troubleshooting.md) if a lib type-checks but fails at runtime,
or vice versa.

## tsconfig aliases (`nestkit sync`)

`sync` writes a root `tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": ".",
    "paths": {
      "@package/billing": ["packages/billing/src/index.ts"],
      "@package/billing/*": ["packages/billing/src/*"]
    }
  }
}
```

and makes each managed package's tsconfig `extend` it. It **regenerates** `paths` from the current
libraries (so renamed/removed libs don't leave stale aliases), strips per-package `rootDir`, and sets
`rootDir: "."` so alias-to-source imports don't trip `TS6059`. `generate` and `add` run it
automatically. The `paths` in `tsconfig.base.json` are owned by nestkit — put custom paths elsewhere.

## Adapters

nestkit is adapter-driven:

- **Compiler adapters** — `swc` (default) and `tsc`.
- **Frontend adapters** — `vite` (`app-frontend`).
- **Bundler adapters** — esbuild / rollup / rolldown interfaces are reserved; bundling is opt-in and
  not part of the default pipeline.
