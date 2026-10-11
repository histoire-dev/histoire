import type { Browser } from 'playwright'
import type { BrowserSetupCandidate, BrowserSetupDriver } from './types.js'
import { hasUnconfirmedCleanup } from '../../cleanup.js'
import { ExecutionError } from '../../execution-types.js'
import { closePreviewBrowser } from '../cleanup.js'
import { PreviewError } from '../errors.js'
import { CAPTURE_LIMITS } from '../limits.js'
import { BrowserSetupLaunchError, BrowserSetupProbeError } from './diagnostics.js'
import { probeSetupBrowser } from './probe.js'
import { isBrowserSetupTimeout } from './report.js'

export { BrowserSetupLaunchError } from './diagnostics.js'

/** Acquires and optionally probes one candidate within capture and candidate bounds. */
export async function acquireSetupBrowser(options: {
  driver: BrowserSetupDriver
  candidate: BrowserSetupCandidate
  signal: AbortSignal
  deadline: number
  isActive: () => boolean
  probe: boolean
}): Promise<Browser> {
  assertAuthority(options, options.deadline)
  const candidateDeadline = Math.min(options.deadline, Date.now() + CAPTURE_LIMITS.browserCandidateTimeoutMs)
  const timeout = remaining(candidateDeadline)
  let browser: Browser | undefined
  let closing: Promise<unknown> | undefined
  const closeBrowser = () => closing ??= closePreviewBrowser(browser!)
  try {
    browser = await options.driver.chromium.launch({ ...options.candidate.launchOptions, timeout })
  }
  catch (error) {
    assertAuthority(options, candidateDeadline, error)
    if (hasUnconfirmedCleanup(error)) throw error
    if (isBrowserSetupTimeout(error) || Date.now() >= candidateDeadline) {
      throw new PreviewError('TIMEOUT', 'Browser setup exceeded its candidate deadline', true)
    }
    throw new BrowserSetupLaunchError(error)
  }

  try {
    assertAuthority(options, candidateDeadline)
    if (options.probe) {
      try {
        await probeSetupBrowser(browser!, { signal: options.signal, deadline: candidateDeadline, isActive: options.isActive, closeBrowser })
      }
      catch (error) {
        if (hasUnconfirmedCleanup(error) || error instanceof PreviewError || isBrowserSetupTimeout(error)) throw error
        throw new BrowserSetupProbeError(error)
      }
    }
    assertAuthority(options, candidateDeadline)
    return browser!
  }
  catch (error) {
    try {
      await closeBrowser()
    }
    catch (cleanupError) {
      throw new ExecutionError('CLEANUP_UNCONFIRMED', 'Rejected setup browser cleanup could not be confirmed', error ?? cleanupError)
    }
    assertAuthority(options, candidateDeadline, error)
    if (isBrowserSetupTimeout(error) || Date.now() >= candidateDeadline) {
      throw new PreviewError('TIMEOUT', 'Browser setup exceeded its candidate deadline', true)
    }
    throw error
  }
}

/** Rejects cancelled, retired, and expired work with stable operation errors. */
function assertAuthority(
  options: { signal: AbortSignal, isActive: () => boolean, deadline: number },
  deadline: number,
  cause?: unknown,
): void {
  if (options.signal.aborted || !options.isActive()) throw new PreviewError('CANCELLED', 'Browser setup operation cancelled', false, undefined, cause)
  if (deadline <= Date.now()) throw new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true, undefined, cause)
}

/** Returns positive Playwright milliseconds without extending its owner deadline. */
function remaining(deadline: number): number {
  const value = deadline - Date.now()
  if (value <= 0) throw new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true)
  return Math.max(1, Math.ceil(value))
}
