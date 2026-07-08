import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncTsconfigPaths } from './tsconfig.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nestkit-ts-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function write(rel: string, content: string) {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content)
}

describe('syncTsconfigPaths', () => {
  beforeEach(() => {
    write('package.json', JSON.stringify({ workspaces: ['packages/*', 'apps/*'] }))
    write('packages/utils/package.json', JSON.stringify({ name: '@app/utils' }))
    write('packages/utils/nestkit.json', JSON.stringify({ type: 'lib' }))
    write('packages/utils/tsconfig.json', JSON.stringify({ compilerOptions: { strict: true } }))
    write('apps/api/package.json', JSON.stringify({ name: '@app/api' }))
    write('apps/api/nestkit.json', JSON.stringify({ type: 'app' }))
    write('apps/api/tsconfig.json', JSON.stringify({ compilerOptions: { strict: true } }))
  })

  it('writes lib path aliases into tsconfig.base.json', () => {
    const res = syncTsconfigPaths(root)
    expect(res.aliases).toBe(1)
    const base = JSON.parse(readFileSync(join(root, 'tsconfig.base.json'), 'utf8'))
    expect(base.compilerOptions.baseUrl).toBe('.')
    expect(base.compilerOptions.paths['@app/utils']).toEqual(['packages/utils/src/index.ts'])
    expect(base.compilerOptions.paths['@app/utils/*']).toEqual(['packages/utils/src/*'])
  })

  it('makes managed package tsconfigs extend the base', () => {
    const res = syncTsconfigPaths(root)
    expect(res.extended.sort()).toEqual(['@app/api', '@app/utils'])
    const api = JSON.parse(readFileSync(join(root, 'apps/api/tsconfig.json'), 'utf8'))
    expect(api.extends).toBe('../../tsconfig.base.json')
  })

  it('strips rootDir so alias-to-source imports do not trip TS6059', () => {
    write(
      'apps/api/tsconfig.json',
      JSON.stringify({ compilerOptions: { strict: true, rootDir: 'src' } }),
    )
    syncTsconfigPaths(root)
    const api = JSON.parse(readFileSync(join(root, 'apps/api/tsconfig.json'), 'utf8'))
    expect(api.compilerOptions.rootDir).toBeUndefined()
    expect(api.extends).toBe('../../tsconfig.base.json')
  })

  it('still strips rootDir even when the tsconfig extends another config', () => {
    write(
      'apps/api/tsconfig.json',
      JSON.stringify({ extends: './custom.json', compilerOptions: { rootDir: 'src' } }),
    )
    syncTsconfigPaths(root)
    const api = JSON.parse(readFileSync(join(root, 'apps/api/tsconfig.json'), 'utf8'))
    expect(api.compilerOptions.rootDir).toBeUndefined()
    expect(api.extends).toBe('./custom.json')
  })

  it('parses JSONC (comments + trailing commas) and still strips rootDir', () => {
    write(
      'apps/api/tsconfig.json',
      `{
  // app config
  "compilerOptions": {
    "strict": true,
    "rootDir": "src", /* build root */
  },
}`,
    )
    syncTsconfigPaths(root)
    const api = JSON.parse(readFileSync(join(root, 'apps/api/tsconfig.json'), 'utf8'))
    expect(api.compilerOptions.rootDir).toBeUndefined()
    expect(api.extends).toBe('../../tsconfig.base.json')
  })

  it('regenerates paths, dropping stale aliases from renamed/removed libs', () => {
    // Pre-existing base with junk aliases from earlier experiments.
    write(
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '#bird': ['packages/bird/src/index.ts'],
            hello: ['packages/hello/src/index.ts'],
          },
        },
      }),
    )
    syncTsconfigPaths(root)
    const base = JSON.parse(readFileSync(join(root, 'tsconfig.base.json'), 'utf8'))
    expect(Object.keys(base.compilerOptions.paths).sort()).toEqual(['@app/utils', '@app/utils/*'])
    expect(base.compilerOptions.paths['#bird']).toBeUndefined()
    expect(base.compilerOptions.paths.hello).toBeUndefined()
  })

  it('does not override an existing extends', () => {
    write('apps/api/tsconfig.json', JSON.stringify({ extends: './custom.json' }))
    const res = syncTsconfigPaths(root)
    expect(res.skipped).toContain('@app/api')
    const api = JSON.parse(readFileSync(join(root, 'apps/api/tsconfig.json'), 'utf8'))
    expect(api.extends).toBe('./custom.json')
  })
})
