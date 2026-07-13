---
"@mgvdev/nestkit-cli": minor
"@mgvdev/create-nestkit": minor
---

feat: add oRPC (+Zod) scaffolding option and a nest-boost oRPC skill

`create-nestkit` and `nestkit generate` can now scaffold an oRPC contract API. Picking oRPC
(app extra or `--orpc`) keeps the Zod contract in a shared library and wires an `@Implement`
controller, `ORPCModule`, and `bodyParser: false` in the app. Ships a `nestkit-orpc` skill so
coding agents follow the contract-first workflow.
