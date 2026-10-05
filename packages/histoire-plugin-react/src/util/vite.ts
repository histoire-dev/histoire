import { createRequire } from 'node:module'

/** Resolve the Vite instance used by Histoire, rather than the JSX plugin's peer. */
export function usesLegacyVite() {
  const require = createRequire(import.meta.url)
  const runtimeRequire = createRequire(require.resolve('histoire'))
  return runtimeRequire('vite/package.json').version.startsWith('7.')
}
