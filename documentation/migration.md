# Migrating from the Nest CLI

nestkit replaces the Nest CLI's **workspace/monorepo/build engine** — not NestJS itself. You keep
`@nestjs/*` as your runtime framework and stop using `nest-cli.json`, `nest build`, and the Webpack
(or `webpack` + `swc-loader`) monorepo mode.

## Automated: `migrate-from-nest-cli`

From the repo root that contains `nest-cli.json`:

```bash
npx nestkit migrate-from-nest-cli          # dry run — prints the mapping
npx nestkit migrate-from-nest-cli --write  # generate the nestkit.json files
```

Mapping:

| nest-cli.json | nestkit.json |
| --- | --- |
| `projects.*.type: "application"` | `{ "type": "app", "entry": "<sourceRoot>/main.ts" }` |
| `projects.*.type: "library"` | `{ "type": "lib" }` |
| single-project (no `projects`) | one `app` from `sourceRoot` / `entryFile` |

It warns when `compilerOptions.webpack` is set (nestkit uses SWC, no Webpack).

## After migrating

1. **Workspaces** — ensure the root declares them (`package.json#workspaces` or
   `pnpm-workspace.yaml`). `nestkit generate` would add these; add them by hand if missing.
2. **Local dependencies** — for each app that imports a library, add the library to its
   `package.json` `dependencies` (`"@scope/lib": "*"`), or run `nestkit add <lib> --to <app>`. The
   graph and build order come from these edges.
3. **Aliases** — run `nestkit sync` to generate `tsconfig.base.json` path aliases.
4. **Verify** — `nestkit graph`, then `nestkit build --all`, then `nestkit typecheck`.

## Behavior differences to expect

- **No Webpack**; SWC transforms, `tsc` type-checks separately. Type errors won't fail a `build` —
  run `nestkit typecheck` (or wire it into CI / `dev`).
- **Libraries are consumed as built packages** (`dist/` + `.d.ts`), not via `tsconfig` path magic at
  build time. Types during development come from `nestkit sync` aliases.
- **Value imports for providers** — if your Nest CLI setup relied on `import type` for injected
  providers, switch them to value imports (see [Troubleshooting](./troubleshooting.md)).
