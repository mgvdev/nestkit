export interface EcoPackage {
  key: string
  npm: string
  /** Where to add it: the app's runtime deps, or the root devDependencies. */
  target: 'app-dep' | 'root-dev'
  desc: string
}

/** The mgvdev NestJS ecosystem packages offered by the initializer (v1: hardcoded). */
export const ECOSYSTEM: EcoPackage[] = [
  {
    key: 'nest-boost',
    npm: '@mgvdev/nest-boost',
    target: 'root-dev',
    desc: 'AI/MCP toolkit that teaches coding agents your Nest app',
  },
  {
    key: 'nestjs-ai',
    npm: '@mgvdev/nestjs-ai',
    target: 'app-dep',
    desc: 'NestJS toolkit on Vercel AI SDK v7 (agents, tools, RAG, streaming)',
  },
]

/** Resolve selected ecosystem keys to their package descriptors (ignoring unknown keys). */
export function ecosystemByKeys(keys: string[]): EcoPackage[] {
  return keys
    .map((k) => ECOSYSTEM.find((p) => p.key === k || p.npm === k))
    .filter(Boolean) as EcoPackage[]
}
