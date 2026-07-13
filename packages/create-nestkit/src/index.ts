#!/usr/bin/env node
import { join, resolve } from 'node:path'
import type { HttpAdapter } from '@mgvdev/nestkit-core'
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import pc from 'picocolors'
import {
  type AppChoices,
  EXTRAS,
  type TestRunner,
  defaultAppChoices,
  generateAppArgs,
} from './app-options.js'
import { ecosystemByKeys, fetchEcosystem } from './ecosystem.js'
import { LINTERS, type LinterChoice, isLinterChoice } from './linters.js'
import { type PackageManager, detectPackageManager, runLabel } from './pm.js'
import {
  applyEcosystem,
  ensureEmptyDir,
  gitInit,
  runInit,
  runInstall,
  runNestkit,
  writeRootFiles,
  writeWorkspaceConfig,
} from './scaffold.js'

const main = defineCommand({
  meta: {
    name: 'create-nestkit',
    description: 'Scaffold a modern NestJS monorepo powered by nestkit.',
  },
  args: {
    projectName: {
      type: 'positional',
      required: false,
      description: 'Directory / workspace name.',
    },
    app: { type: 'string', default: 'api', description: 'First Nest app name.' },
    scope: { type: 'string', default: '@app', description: 'npm scope for generated packages.' },
    lib: { type: 'boolean', description: 'Include a shared library.' },
    frontend: { type: 'boolean', description: 'Include a Vite frontend app.' },
    template: {
      type: 'string',
      default: 'vanilla-ts',
      description: 'create-vite template for the frontend.',
    },
    linter: {
      type: 'string',
      default: 'biome',
      description: 'Linter/formatter: biome | eslint-prettier | oxlint-oxfmt.',
    },
    test: { type: 'string', default: 'jest', description: 'Test runner: jest | vitest.' },
    adapter: {
      type: 'string',
      default: 'express',
      description: 'HTTP adapter: express | fastify | bun. Defaults to bun under Bun.',
    },
    service: { type: 'boolean', default: true, description: 'App: service + unit spec.' },
    e2e: { type: 'boolean', default: true, description: 'App: e2e tests.' },
    config: { type: 'boolean', description: 'App: @nestjs/config + .env.' },
    validation: { type: 'boolean', description: 'App: class-validator + ValidationPipe.' },
    orpc: {
      type: 'boolean',
      description: 'App: oRPC contract API (+ Zod). Adds a shared lib for the contract.',
    },
    with: {
      type: 'string',
      description: 'Comma-separated ecosystem packages (e.g. nest-boost,nestjs-ai).',
    },
    pm: { type: 'string', description: 'Force a package manager (npm|pnpm|yarn|bun).' },
    git: { type: 'boolean', default: true, description: 'Initialize a git repo.' },
    install: { type: 'boolean', default: true, description: 'Install project dependencies.' },
    init: {
      type: 'boolean',
      default: true,
      description: 'Run selected ecosystem packages’ setup (e.g. nest-boost install).',
    },
    yes: { type: 'boolean', description: 'Accept defaults, skip prompts.' },
  },
  async run({ args }) {
    const pm = (args.pm as PackageManager) || detectPackageManager()
    const interactive = !args.yes && Boolean(process.stdin.isTTY)

    const name =
      args.projectName ||
      (interactive
        ? String(await consola.prompt('Project name?', { type: 'text', initial: 'my-nestkit-app' }))
        : 'my-nestkit-app')

    const appName = interactive
      ? String(await consola.prompt('App name?', { type: 'text', initial: args.app }))
      : args.app

    const withLib = interactive
      ? Boolean(
          await consola.prompt('Include a shared library?', {
            type: 'confirm',
            initial: Boolean(args.lib),
          }),
        )
      : Boolean(args.lib)

    const withFrontend = interactive
      ? Boolean(
          await consola.prompt('Include a Vite frontend?', {
            type: 'confirm',
            initial: Boolean(args.frontend),
          }),
        )
      : Boolean(args.frontend)

    let linter: LinterChoice = isLinterChoice(args.linter) ? args.linter : 'biome'
    if (interactive) {
      const picked = await consola.prompt('Linter & formatter?', {
        type: 'select',
        initial: linter,
        options: Object.values(LINTERS).map((l) => ({ label: l.label, value: l.key })),
      })
      if (typeof picked === 'string' && isLinterChoice(picked)) linter = picked
    }

    // App options: test runner, HTTP adapter, extras.
    const app: AppChoices = {
      ...defaultAppChoices(pm),
      test: (args.test === 'vitest' ? 'vitest' : 'jest') as TestRunner,
      service: args.service !== false,
      e2e: args.e2e !== false,
      config: Boolean(args.config),
      validation: Boolean(args.validation),
      orpc: Boolean(args.orpc),
    }
    if (args.adapter === 'fastify' || (args.adapter === 'bun' && pm === 'bun')) {
      app.adapter = args.adapter as HttpAdapter
    } else if (args.adapter !== undefined && args.adapter !== 'express') {
      app.adapter = pm === 'bun' ? 'bun' : 'express'
    }
    if (interactive) {
      app.test = (await consola.prompt('Test runner?', {
        type: 'select',
        initial: app.test,
        options: [
          { label: 'Jest (Nest default)', value: 'jest' },
          { label: 'Vitest (light, ESM)', value: 'vitest' },
        ],
      })) as TestRunner
      const adapterOptions = [
        { label: 'Express', value: 'express' },
        { label: 'Fastify', value: 'fastify' },
        ...(pm === 'bun' ? [{ label: 'Bun (Bun.serve)', value: 'bun' }] : []),
      ]
      app.adapter = (await consola.prompt('HTTP adapter?', {
        type: 'select',
        initial: app.adapter,
        options: adapterOptions,
      })) as HttpAdapter
      const picked = await consola.prompt('Include in the app?', {
        type: 'multiselect',
        required: false,
        options: EXTRAS.map((e) => ({
          label: e.label,
          value: e.key,
          selected: defaultAppChoices(pm)[e.key],
        })),
      })
      const set = new Set(Array.isArray(picked) ? (picked as unknown as string[]) : [])
      app.service = set.has('service')
      app.e2e = set.has('e2e')
      app.config = set.has('config')
      app.validation = set.has('validation')
      app.orpc = set.has('orpc')
    }

    const catalog = await fetchEcosystem()
    let ecoKeys = args.with
      ? String(args.with)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    if (interactive && catalog.length > 0) {
      const selected = await consola.prompt('Add ecosystem packages?', {
        type: 'multiselect',
        required: false,
        options: catalog.map((p) => ({ label: `${p.key} — ${p.desc}`, value: p.key })),
      })
      ecoKeys = Array.isArray(selected) ? (selected as unknown as string[]) : []
    }

    const doGit = interactive
      ? Boolean(await consola.prompt('Initialize git?', { type: 'confirm', initial: args.git }))
      : args.git
    const doInstall = interactive
      ? Boolean(
          await consola.prompt('Install dependencies now?', {
            type: 'confirm',
            initial: args.install,
          }),
        )
      : args.install

    const target = resolve(process.cwd(), name)
    consola.start(`Creating ${pc.bold(name)} with ${pc.cyan(pm)}...`)
    ensureEmptyDir(target)
    writeRootFiles(target, { name, pm, frontend: withFrontend, linter })
    writeWorkspaceConfig(target, { httpAdapter: app.adapter })

    // Install nestkit-cli first so its bin is available for scaffolding.
    runInstall(pm, target)

    // oRPC keeps its contract in the shared library, so it implies one.
    const needLib = withLib || app.orpc
    const scope = args.scope.startsWith('@') ? args.scope : `@${args.scope}`
    const sharedName = `${scope}/shared`

    if (needLib) {
      if (app.orpc && !withLib) {
        consola.info('oRPC needs a shared library for the contract — adding one.')
      }
      runNestkit(target, [
        'generate',
        'lib',
        'shared',
        '--scope',
        args.scope,
        '--test',
        app.test,
        ...(app.orpc ? ['--orpc'] : []),
      ])
    }
    runNestkit(target, generateAppArgs(appName, args.scope, app, app.orpc ? sharedName : undefined))
    if (needLib) {
      runNestkit(target, ['add', 'shared', '--to', appName, '--no-install'])
    }
    if (withFrontend) {
      runNestkit(target, [
        'generate',
        'app-frontend',
        'web',
        '--scope',
        args.scope,
        '--template',
        args.template,
      ])
    }

    const chosen = ecosystemByKeys(catalog, ecoKeys)
    applyEcosystem(target, join(target, 'apps', appName), chosen)

    if (doInstall) runInstall(pm, target)

    // Run each selected package's init command (e.g. nest-boost install). Needs the
    // deps installed and an interactive terminal (these setups usually prompt).
    if (doInstall && args.init && process.stdin.isTTY) {
      for (const p of chosen) {
        if (!p.init) continue
        consola.info(`Initializing ${pc.bold(p.key)}...`)
        if (!runInit(target, p.init.bin, p.init.args)) {
          consola.warn(
            `Skipped ${p.key} init (run \`${p.init.bin} ${p.init.args.join(' ')}\` yourself).`,
          )
        }
      }
    }

    if (doGit) gitInit(target)

    consola.success(`Created ${pc.bold(name)}`)
    const steps = [
      `cd ${name}`,
      doInstall ? '' : `${pm} install`,
      `${runLabel(pm)} nestkit dev ${appName}`,
    ].filter(Boolean)
    consola.box(steps.join('\n'))
  },
})

runMain(main)
