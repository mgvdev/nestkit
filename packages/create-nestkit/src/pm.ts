export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** Detect the package manager from the `npm_config_user_agent` (set by `<pm> create`). */
export function detectPackageManager(
  userAgent = process.env.npm_config_user_agent ?? '',
): PackageManager {
  const name = userAgent.split(' ')[0]?.split('/')[0]
  if (name === 'pnpm' || name === 'yarn' || name === 'bun') return name
  return 'npm'
}

/** The install command (argv) for a package manager. */
export function installCommand(pm: PackageManager): string[] {
  return pm === 'yarn' ? ['yarn'] : [pm, 'install']
}

/** The `<pm> run dev`-style runner label shown in next steps. */
export function runLabel(pm: PackageManager): string {
  return pm === 'npm' ? 'npx' : pm === 'bun' ? 'bunx' : `${pm} exec`
}
