#!/usr/bin/env node
import { join, resolve } from 'node:path'
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import pc from 'picocolors'
import { ecosystemByKeys, fetchEcosystem } from './ecosystem.js'
import { type PackageManager, detectPackageManager, runLabel } from './pm.js'
import {
  applyEcosystem,
  ensureEmptyDir,
  gitInit,
  runInstall,
  runNestkit,
  writeRootFiles,
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
    with: {
      type: 'string',
      description: 'Comma-separated ecosystem packages (e.g. nest-boost,nestjs-ai).',
    },
    pm: { type: 'string', description: 'Force a package manager (npm|pnpm|yarn|bun).' },
    git: { type: 'boolean', default: true, description: 'Initialize a git repo.' },
    install: { type: 'boolean', default: true, description: 'Install project dependencies.' },
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
    writeRootFiles(target, { name, pm, frontend: withFrontend })

    // Install nestkit-cli first so its bin is available for scaffolding.
    runInstall(pm, target)
    runNestkit(target, ['generate', 'app', appName, '--scope', args.scope])
    if (withLib) {
      runNestkit(target, ['generate', 'lib', 'shared', '--scope', args.scope])
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

    applyEcosystem(target, join(target, 'apps', appName), ecosystemByKeys(catalog, ecoKeys))

    if (doInstall) runInstall(pm, target)
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
