import type { HistoireBrowserConfig } from '@histoire/shared'
import type { BrowserSetupPolicy } from './types.js'
import { normalizeBrowserConfig } from '../../../config/browser.js'

/**
 * Creates one immutable normalized policy with paths resolved against its project root.
 * @param value Trusted Histoire browser config.
 * @param projectRoot Histoire project root.
 */
export function createBrowserSetupPolicy(value: HistoireBrowserConfig | undefined, projectRoot: string): BrowserSetupPolicy {
  const normalized = normalizeBrowserConfig(value, projectRoot)
  return Object.freeze({
    source: normalized.source ?? 'auto',
    ...('executablePath' in normalized ? { executablePath: normalized.executablePath } : {}),
    ...(normalized.reuse === true ? { reuse: true as const, idleTimeoutMs: normalized.idleTimeoutMs ?? 30_000 } : {}),
  })
}
