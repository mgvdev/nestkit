export type LinterChoice = 'biome' | 'eslint-prettier' | 'oxlint-oxfmt'

export interface LinterSetup {
  key: LinterChoice
  label: string
  devDependencies: Record<string, string>
  /** Config files to write at the workspace root. */
  files: Record<string, string>
  scripts: { lint: string; format: string }
}

const BIOME_CONFIG = `${JSON.stringify(
  {
    $schema: 'https://biomejs.dev/schemas/2.5.3/schema.json',
    formatter: { enabled: true, indentStyle: 'space' },
    linter: { enabled: true, rules: { recommended: true } },
  },
  null,
  2,
)}\n`

const ESLINT_CONFIG = `import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
)
`

export const LINTERS: Record<LinterChoice, LinterSetup> = {
  biome: {
    key: 'biome',
    label: 'Biome (lint + format, fast, one tool)',
    devDependencies: { '@biomejs/biome': '^2.5.3' },
    files: { 'biome.json': BIOME_CONFIG },
    scripts: { lint: 'biome check .', format: 'biome format --write .' },
  },
  'eslint-prettier': {
    key: 'eslint-prettier',
    label: 'ESLint + Prettier (classic)',
    devDependencies: {
      eslint: '^10.0.0',
      '@eslint/js': '^10.0.0',
      'typescript-eslint': '^8.0.0',
      prettier: '^3.0.0',
      'eslint-config-prettier': '^10.0.0',
    },
    files: { 'eslint.config.mjs': ESLINT_CONFIG, '.prettierrc.json': '{}\n' },
    scripts: { lint: 'eslint .', format: 'prettier --write .' },
  },
  'oxlint-oxfmt': {
    key: 'oxlint-oxfmt',
    label: 'oxlint + oxfmt (Rust, very fast)',
    devDependencies: { oxlint: '^1.0.0', oxfmt: '^0.58.0' },
    files: { '.oxlintrc.json': '{}\n' },
    scripts: { lint: 'oxlint', format: 'oxfmt' },
  },
}

export function isLinterChoice(x: string): x is LinterChoice {
  return x === 'biome' || x === 'eslint-prettier' || x === 'oxlint-oxfmt'
}
