#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { buildCommand } from './commands/build.js'
import { cleanCommand } from './commands/clean.js'
import { devCommand } from './commands/dev.js'
import { graphCommand } from './commands/graph.js'
import { initCommand } from './commands/init.js'
import { migrateCommand } from './commands/migrate.js'
import { typecheckCommand } from './commands/typecheck.js'

const main = defineCommand({
  meta: {
    name: 'nestkit',
    version: '0.1.0',
    description: 'Modern, package-manager-agnostic NestJS workspace engine (SWC, no Webpack).',
  },
  subCommands: {
    init: initCommand,
    graph: graphCommand,
    build: buildCommand,
    dev: devCommand,
    typecheck: typecheckCommand,
    clean: cleanCommand,
    'migrate-from-nest-cli': migrateCommand,
  },
})

runMain(main)
