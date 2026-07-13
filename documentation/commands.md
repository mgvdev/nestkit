# Commands

Run all commands from the workspace root. Project references accept the full package name
(`@app/api`), the unscoped name (`api`), or the package directory name.

## `nestkit init`
Generate a `nestkit.json` for each detected package, inferring the type (`vite`/`react`/`vue` →
`app-frontend`; `@nestjs/core` + `src/main.ts` → `app`; else `lib`). Skips packages that already have
one. **Writes by default**; use `--dry` to preview.

## `nestkit generate <kind> <name>` (alias `g`, `new`)
Scaffold a new package.

- `app` → `apps/<name>` (Nest HTTP app, built-in template)
- `lib` → `packages/<name>` (Nest library: `<Name>Module` + `<Name>Service` + barrel)
- `app-frontend` → `apps/<name>` via Vite's `create-vite`, then wired in

Options: `--dir <dir>` (override target dir), `--scope @foo` (default `@package`, or the root scope),
`--template <t>` (create-vite template; omit for interactive prompts), `--install`, `--dry`.

**App options** (`generate app`): `--adapter express|fastify` (default express), `--test
jest|vitest|none` (default jest, wires the spec/e2e config + scripts), `--service`/`--no-service`
(service + unit spec, default on), `--e2e`/`--no-e2e` (e2e suite, default on), `--config`
(@nestjs/config + `.env`), `--validation` (class-validator + global ValidationPipe), `--orpc`
(oRPC contract API + Zod; keeps the contract in a shared lib via `--orpc-contract <pkg>`, or inline
when standalone). Generated apps ship a Jest **or** Vitest setup (unit + e2e), an `AppService`, and
the chosen HTTP adapter — close to `nest new`. `generate lib` takes `--test` (and `--orpc` to ship a
contract) too.

**Nest building blocks** — inside an existing app/lib (requires `--in <project>`):
`module`, `service`, `controller`, `resource` (module+service+controller), `guard`, `pipe`,
`interceptor`, `filter`, `middleware`, `decorator`.

```bash
nestkit g service billing --in api   # apps/api/src/billing/billing.service.ts + registered in app.module
nestkit g resource user --in api     # full CRUD module, imported into app.module
```

Files go in a folder named after the block (or `src` with `--flat`); `service`/`controller`/`module`/
`resource` are auto-registered in the app's `app.module.ts` (`providers`/`controllers`/`imports`).

## `nestkit add <lib> --to <app>`
Add a local library as a dependency of an app: writes `"<lib>": "*"` into the app's `package.json`,
runs install, and re-syncs tsconfig aliases. `--no-install` skips the install.

## `nestkit install` (alias `i`)
Run the detected package manager's install at the workspace root (covers every app and package).
Extra arguments are forwarded to the PM (e.g. `nestkit install --frozen-lockfile`).

## `nestkit graph [--json]`
Print the project graph, build levels, and each project's local dependencies.

## `nestkit build <project> | --all | --affected <ref>`
Build a project and its local-dependency closure, every managed project, or only those changed since a
git ref (plus their dependents). In dependency order; libraries emit `.d.ts`, apps are SWC-transformed,
frontends build via Vite. A **content-hash cache** skips unchanged projects (`cached …`); pass
`--no-cache` to force a rebuild.

## `nestkit dev <projects…> | --all`
Run one or more projects in watch mode with rebuild + restart.

- Targets: comma or space list (`dev api,web`, `dev api web`) or `--all` (every `app` + `app-frontend`;
  libraries are watched, not run).
- Output is prefixed and color-coded per process (`[api] …`, `[web] …`).
- Editing a library rebuilds it and restarts only the dependent apps; a crashed process logs its exit
  and the others keep running (a file change restarts it).
- `--tui` shows split panes (TTY only; falls back to prefixed lines when piped).
- **Ports:** each app gets a distinct port — its `devPort` (from `nestkit.json`) or `--port-base`
  (default 3000) plus its index — injected as `PORT`. So `dev --all` never collides.
- **Debugging:** `--inspect` / `--inspect-brk` attach the Node inspector with a distinct port per app
  (9229, 9230, …).
- `--typecheck` (default true) runs typecheck out-of-band on changes.
- Pointing `dev` at a library is an error.

## `nestkit typecheck [--affected <ref>]`
Run `tsc --noEmit` across managed apps and libraries (or only those affected since a git ref). Exits
non-zero on errors. Frontends run their own type checking and are excluded.

## `nestkit doctor [--fix]`
Diagnose common footguns: `import type` on an injected provider (breaks DI), a workspace package
imported but not declared as a dependency, a `rootDir` that trips TS6059, a missing
`tsconfig.base.json`, an unsupported TypeScript (7.x), and Nest-looking packages without a
`nestkit.json`. `--fix` applies the auto-fixable ones (runs `nestkit sync`). Exits non-zero if any
error-level issue is found.

## `nestkit sync`
(Re)generate `tsconfig.base.json` path aliases so libraries import by name with autocompletion. Run
once in an existing repo; `generate` and `add` run it automatically. See
[Concepts → tsconfig aliases](./concepts.md#tsconfig-aliases-nestkit-sync).

## `nestkit clean [projects…]`
Remove build outputs (`outDir` + `tsconfig.tsbuildinfo`) for all managed projects, or the named ones.

## `nestkit migrate-from-nest-cli`
Read an existing `nest-cli.json` and generate a `nestkit.json` per project (`application` → `app` with
`entry`, `library` → `lib`). **Dry run by default**; use `--write` to create the files. Warns when the
source used Webpack (nestkit replaces it with SWC).
