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

## `nestkit build <project> | --all`
Build a project and its local-dependency closure, or every managed project, in dependency order.
Libraries emit `.d.ts`; apps are SWC-transformed; frontends build via Vite.

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

## `nestkit typecheck`
Run `tsc --noEmit` across managed apps and libraries. Exits non-zero on errors. Frontends run their
own type checking and are excluded.

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
