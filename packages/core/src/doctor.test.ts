import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runDoctorChecks } from './doctor.js'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nestkit-doctor-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function write(rel: string, content: string) {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content)
}

describe('runDoctorChecks', () => {
  beforeEach(() => {
    write('package.json', JSON.stringify({ workspaces: ['packages/*', 'apps/*'] }))
    write('packages/lib/package.json', JSON.stringify({ name: '@app/lib' }))
    write('packages/lib/nestkit.json', JSON.stringify({ type: 'lib' }))
    write('packages/lib/src/index.ts', 'export class LibService {}')
  })

  it('flags import type on an injected provider', () => {
    write(
      'apps/api/package.json',
      JSON.stringify({ name: '@app/api', dependencies: { '@app/lib': '*' } }),
    )
    write('apps/api/nestkit.json', JSON.stringify({ type: 'app' }))
    write(
      'apps/api/src/app.controller.ts',
      `import type { LibService } from '@app/lib'\nexport class C { constructor(private s: LibService) {} }`,
    )
    const findings = runDoctorChecks(root)
    expect(findings.some((f) => f.level === 'error' && /import type/.test(f.message))).toBe(true)
  })

  it('flags a workspace import that is not a declared dependency', () => {
    write('apps/api/package.json', JSON.stringify({ name: '@app/api' })) // no @app/lib dep
    write('apps/api/nestkit.json', JSON.stringify({ type: 'app' }))
    write('apps/api/src/main.ts', `import { LibService } from '@app/lib'\nconsole.log(LibService)`)
    const findings = runDoctorChecks(root)
    expect(findings.some((f) => /doesn't declare it as a dependency/.test(f.message))).toBe(true)
  })

  it('is clean for a correct setup', () => {
    write('tsconfig.base.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: {} } }))
    write(
      'apps/api/package.json',
      JSON.stringify({ name: '@app/api', dependencies: { '@app/lib': '*' } }),
    )
    write('apps/api/nestkit.json', JSON.stringify({ type: 'app' }))
    write('apps/api/src/main.ts', `import { LibService } from '@app/lib'\nconsole.log(LibService)`)
    const findings = runDoctorChecks(root)
    expect(findings).toEqual([])
  })
})
