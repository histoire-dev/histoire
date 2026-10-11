import type { RollupOutput } from 'rollup'
import type { NodeArtifactBrowserDriver } from './package.js'
import { resolveBrowserSetupDriverIdentity } from '../../runtime/browser/setup/driver.js'

/** Requires emitted variant session and actual preview Vitest modules, not package declarations. */
export function includesEmbeddedTestRuntime(output: RollupOutput): boolean {
  const modules = output.output.flatMap(item => item.type === 'chunk' ? Object.entries(item.modules).filter(([, metadata]) => metadata.renderedLength > 0).map(([id]) => id.replace(/\\/g, '/')) : [])
  return modules.some(id => id.includes('/variant-test-session/')) && modules.some(id => id.includes('/@vitest/spy/')) && modules.some(id => id.includes('/@vitest/mocker/'))
}

/**
 * Pins the exact browser package selected by shared, launch-free driver discovery.
 * @param root Project root used by shared browser-driver resolution.
 */
export async function resolveBuildBrowserDriver(root: string): Promise<NodeArtifactBrowserDriver | undefined> {
  const result = await resolveBrowserSetupDriverIdentity(root)
  if (result.status === 'missing') return
  if (result.status === 'invalid') {
    throw new Error(`Selected browser driver package metadata is invalid: ${result.packageName}`)
  }
  return { packageName: result.identity.packageName, version: result.identity.version }
}

/**
 * Compatibility projection for callers that only need the legacy Playwright version.
 * @param root Project root used by shared browser-driver resolution.
 */
export async function resolveBuildPlaywrightVersion(root: string): Promise<string | undefined> {
  const browserDriver = await resolveBuildBrowserDriver(root)
  return browserDriver?.packageName === 'playwright' ? browserDriver.version : undefined
}
