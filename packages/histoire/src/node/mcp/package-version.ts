import { readFileSync } from 'node:fs'

/** Reads installed Histoire version for server metadata; artifact runtimes inject their manifest version. */
export function readHistoireVersion(): string {
  const metadata = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))
  if (typeof metadata.version !== 'string' || !metadata.version) throw new Error('Histoire package version is missing')
  return metadata.version
}
