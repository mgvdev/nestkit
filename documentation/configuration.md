# Configuration — `nestkit.json`

Each managed package carries a `nestkit.json` describing how nestkit should treat it. A package
without one is visible to the graph but not compiled by nestkit.

```jsonc
{
  "type": "app" | "lib" | "app-frontend", // required
  "entry": "src/main.ts",   // apps — default "src/main.ts"
  "compiler": "swc",        // "swc" (default) | "tsc"
  "outDir": "dist",         // default "dist"
  "sourceDir": "src",       // default "src"
  "adapter": "vite",        // app-frontend only — default "vite"
  "assets": ["src/**/*.json"], // optional non-TS files to copy into outDir
  "tsconfig": "tsconfig.json"  // default "tsconfig.json"
}
```

## Fields

| Field | Applies to | Default | Notes |
| --- | --- | --- | --- |
| `type` | all | — | `app`, `lib`, or `app-frontend`. Required. |
| `entry` | app | `src/main.ts` | Bootstrap file; its build output is what `dev` runs. |
| `compiler` | app, lib | `swc` | `tsc` also emits JS + `.d.ts`. |
| `outDir` | app, lib | `dist` | Build output directory. |
| `sourceDir` | app, lib | `src` | Source root. |
| `adapter` | app-frontend | `vite` | Frontend adapter name. |
| `assets` | app, lib | `[]` | Glob patterns copied verbatim into `outDir`. |
| `devPort` | app | auto | Fixed `PORT` for `nestkit dev`; otherwise auto-assigned (base + index). |
| `tsconfig` | all | `tsconfig.json` | Used for typecheck and `.d.ts`. |

## Project types

### `app` — a Nest application
SWC-transformed; run as `node <outDir>/main.js`. In dev it restarts on change.

### `lib` — a Nest library
Builds to `dist/` with `.d.ts`. `nestkit generate lib <name>` scaffolds a Nest module named after the
package (`<Name>Module` providing + exporting `<Name>Service`) plus a barrel `index.ts`, so consumers
just `imports: [<Name>Module]`.

### `app-frontend` — a Vite frontend
Driven by the Vite adapter (its own build and dev server with HMR). `nestkit generate app-frontend`
delegates to Vite's official `create-vite`, then adds `nestkit.json`. Frontend projects are **not**
type-checked by `nestkit typecheck` (they run their own).

## Generated tsconfig

Generated packages get a tsconfig that extends the root `tsconfig.base.json` (managed by
`nestkit sync`) and uses:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "extends": "../../tsconfig.base.json"
}
```

`NodeNext` matches the CommonJS runtime SWC emits, allows extension-less imports, respects package
`exports`, and is not deprecated (unlike `moduleResolution: "Node"`). Note there is **no `rootDir`** —
`sync` keeps it at the workspace root so alias-to-source imports don't trip `TS6059`.
