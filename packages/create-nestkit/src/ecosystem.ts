export interface EcoPackage {
  key: string
  npm: string
  /** Where to add it: the app's runtime deps, or the root devDependencies. */
  target: 'app-dep' | 'root-dev'
  desc: string
}

/** Remote manifest URL (site-owned). Falls back to the built-in list when unreachable. */
export const MANIFEST_URL = 'https://nestjs.mgvdev.io/ecosystem.json'

/** Built-in fallback catalog (used offline or when the manifest is unavailable/invalid). */
export const FALLBACK_ECOSYSTEM: EcoPackage[] = [
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

function isEcoPackage(x: unknown): x is EcoPackage {
  const o = x as Record<string, unknown>
  return (
    !!o &&
    typeof o.key === 'string' &&
    typeof o.npm === 'string' &&
    (o.target === 'app-dep' || o.target === 'root-dev') &&
    typeof o.desc === 'string'
  )
}

/** Validate a fetched manifest (array of packages). Returns null if unusable. */
export function parseManifest(data: unknown): EcoPackage[] | null {
  const arr = Array.isArray(data) ? data : (data as { packages?: unknown })?.packages
  if (!Array.isArray(arr)) return null
  const items = arr.filter(isEcoPackage)
  return items.length > 0 ? items : null
}

/**
 * Fetch the ecosystem catalog from the remote manifest, falling back to the
 * built-in list on any error (offline, non-200, invalid, timeout).
 */
export async function fetchEcosystem(url = MANIFEST_URL, timeoutMs = 3000): Promise<EcoPackage[]> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return FALLBACK_ECOSYSTEM
    return parseManifest(await res.json()) ?? FALLBACK_ECOSYSTEM
  } catch {
    return FALLBACK_ECOSYSTEM
  }
}

/** Resolve selected keys to package descriptors from a catalog (ignoring unknown keys). */
export function ecosystemByKeys(catalog: EcoPackage[], keys: string[]): EcoPackage[] {
  return keys
    .map((k) => catalog.find((p) => p.key === k || p.npm === k))
    .filter(Boolean) as EcoPackage[]
}
