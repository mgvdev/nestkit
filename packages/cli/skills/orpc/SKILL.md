---
name: nestkit-orpc
description: Use when building or changing HTTP APIs in a nestkit workspace that uses oRPC (an app has @orpc/nest, a shared lib exports an oRPC `contract`, files import from '@orpc/contract'/'@orpc/nest', or the user asks for a contract-first / type-safe / Zod-validated API). Covers where the contract lives, how to implement it in a Nest controller, module + bootstrap wiring, and the common gotchas.
---

# nestkit + oRPC

[oRPC](https://orpc.dev) gives contract-first, end-to-end type-safe HTTP APIs. In a nestkit
workspace the convention is **contract in the shared library, implementation in the app**:

- **Shared lib** (`packages/shared`) — defines Zod schemas + the oRPC `contract` and exports it
  from its barrel. Depends on `@orpc/contract` + `zod`.
- **App** (`apps/*`) — implements the contract with `@Implement` controllers and wires
  `ORPCModule`. Depends on `@orpc/nest` + `@orpc/server`, and on the shared lib by name.

Detect this setup by `@orpc/nest` in an app's `package.json` and an exported `contract` in the
shared lib (`src/contract.ts`).

## Define / extend the contract (in the shared lib)

`packages/shared/src/contract.ts`:

```ts
import { oc, populateContractRouterPaths } from '@orpc/contract'
import * as z from 'zod'

export const PlanetSchema = z.object({
  id: z.number().int().min(1),
  name: z.string(),
  description: z.string().optional(),
})

export const listPlanetContract = oc
  .route({ method: 'GET', path: '/planets' }) // a `path` is REQUIRED on every route
  .input(z.object({ limit: z.number().int().min(1).max(100).optional() }))
  .output(z.array(PlanetSchema))

export const contract = populateContractRouterPaths({
  planet: { list: listPlanetContract },
})
```

Export it from the lib barrel (`src/index.ts`): `export * from './contract'`.

To add an endpoint: add a `z` schema + an `oc.route(...).input(...).output(...)` contract, then add
it under the right key in `populateContractRouterPaths({ ... })`.

## Implement it (in the app)

One controller method per contract procedure, wired with `@Implement`:

```ts
import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { contract } from '@app/shared' // the shared lib package name

@Controller()
export class PlanetController {
  @Implement(contract.planet.list)
  list() {
    return implement(contract.planet.list).handler(({ input }) => {
      // input is already validated against the contract's Zod schema.
      return [{ id: 1, name: 'Tatooine' }]
    })
  }
}
```

Register the controller in the module's `controllers` array.

## Module + bootstrap wiring

`app.module.ts`:

```ts
import { REQUEST } from '@nestjs/core'
import { onError, ORPCModule } from '@orpc/nest'

@Module({
  imports: [
    ORPCModule.forRootAsync({
      useFactory: (request: unknown) => ({
        interceptors: [onError((error) => console.error(error))],
        context: { request },
      }),
      inject: [REQUEST],
    }),
  ],
  controllers: [PlanetController],
})
export class AppModule {}
```

`main.ts` — **disable Nest's body parser** so oRPC can parse requests itself:

```ts
const app = await NestFactory.create(AppModule, { bodyParser: false })
```

## Gotchas

- **`bodyParser: false` is required.** Without it oRPC cannot read request bodies. Keep it when
  adding other bootstrap options.
- **Every `oc.route` needs a `path`.** `populateContractRouterPaths` fills nested paths but the
  method + base path must be set.
- **oRPC is ESM-only.** Keep `tsconfig` `module`/`moduleResolution` on `NodeNext` (nestkit's default)
  and run on Node 22+. If the built app fails to load `@orpc/*` at runtime, set `"type": "module"`
  in the app's `package.json`.
- The app must depend on the shared lib (run `nestkit add shared --to <app>`), otherwise the
  `contract` import won't resolve.
- Validation is handled by the contract's Zod schemas — don't also add a global `ValidationPipe`
  for oRPC routes.
