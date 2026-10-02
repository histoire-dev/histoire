import type { RollupOutput } from 'rollup'
import { readFileSync } from 'node:fs'
import { tryResolveDependency } from '../../util/resolve-package.js'

/** Requires emitted variant session and actual preview Vitest modules, not package declarations. */
export function includesEmbeddedTestRuntime(output: RollupOutput): boolean {
  const modules = output.output.flatMap(item => item.type === 'chunk' ? Object.entries(item.modules).filter(([, metadata]) => metadata.renderedLength > 0).map(([id]) => id.replace(/\\/g, '/')) : [])
  return modules.some(id => id.includes('/variant-test-session/')) && modules.some(id => id.includes('/@vitest/spy/')) && modules.some(id => id.includes('/@vitest/mocker/'))
}

/** Pins optional deployed browser dependency to the package exercised by this build. */
export function resolveBuildPlaywrightVersion(root: string): string | undefined {
  const path = tryResolveDependency(root, 'playwright/package.json')
  if (!path) return
  try {
    const metadata = JSON.parse(readFileSync(path, 'utf8'))
    return typeof metadata.version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(metadata.version) ? metadata.version : undefined
  }
  catch { return undefined }
}
