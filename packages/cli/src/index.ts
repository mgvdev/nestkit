#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { addCommand } from './commands/add.js'
import { buildCommand } from './commands/build.js'
import { cleanCommand } from './commands/clean.js'
import { devCommand } from './commands/dev.js'
import { generateCommand } from './commands/generate.js'
import { graphCommand } from './commands/graph.js'
import { initCommand } from './commands/init.js'
import { installCommand } from './commands/install.js'
import { migrateCommand } from './commands/migrate.js'
import { syncCommand } from './commands/sync.js'
import { typecheckCommand } from './commands/typecheck.js'

const main = defineCommand({
  meta: {
    name: 'nestkit',
    version: '0.1.0',
    description: 'Modern, package-manager-agnostic NestJS workspace engine (SWC, no Webpack).',
  },
  subCommands: {
    init: initCommand,
    install: installCommand,
    i: installCommand,
    generate: generateCommand,
    g: generateCommand,
    new: generateCommand,
    graph: graphCommand,
    build: buildCommand,
    add: addCommand,
    dev: devCommand,
    typecheck: typecheckCommand,
    sync: syncCommand,
    clean: cleanCommand,
    'migrate-from-nest-cli': migrateCommand,
  },
})

runMain(main)
