import type {
  ScreenshotSetupAttempt,
  ScreenshotSetupCommandKey,
  ScreenshotSetupDiagnostic,
  ScreenshotSetupReason,
  ScreenshotSetupRepair,
  ScreenshotSetupRepairId,
  ScreenshotSetupSnapshot,
  ScreenshotSetupStage,
} from '@histoire/shared'
import type { BrowserSetupDriver, BrowserSetupPackage, BrowserSetupPolicy } from './types.js'
import { getScreenshotSetupCommand } from '@histoire/shared'
import { hasUnconfirmedCleanup } from '../../cleanup.js'
import { PreviewError } from '../errors.js'
import { supportsSeparatedHeadlessShell } from './candidates.js'
import { type BrowserSetupDiagnosis, type BrowserSetupFailureStage, BrowserSetupLaunchError, BrowserSetupProbeError, diagnoseBrowserSetupFailure } from './diagnostics.js'

export { serializeScreenshotSetupCommand } from '@histoire/shared'

/** Maps only audited Playwright startup failures to safe setup categories. */
export function classifyBrowserSetupFailure(error: unknown): ScreenshotSetupReason | undefined {
  if (hasUnconfirmedCleanup(error)) return
  const reason = diagnoseBrowserSetupFailure(error, 'launch').reason
  return reason === 'startup-failed' ? undefined : reason
}

/** Builds one path-free detailed attempt for a candidate operation failure. */
export function createBrowserSetupFailureAttempt(
  source: ScreenshotSetupAttempt['source'],
  error: unknown,
  driver: BrowserSetupDriver,
): { attempt: ScreenshotSetupAttempt, continueCandidates: boolean } {
  const stage: BrowserSetupFailureStage | undefined = error instanceof BrowserSetupProbeError
    ? 'probe'
    : error instanceof BrowserSetupLaunchError ? 'launch' : undefined
  const diagnosis: BrowserSetupDiagnosis = stage
    ? diagnoseBrowserSetupFailure(error, stage)
    : { diagnostic: { code: 'unknown' }, continueCandidates: false }
  return {
    attempt: createSetupAttempt(source, diagnosis.reason ?? 'startup-failed', stage, driver, diagnosis.diagnostic),
    continueCandidates: diagnosis.continueCandidates,
  }
}

/** Records known absent inventory without private filesystem details. */
export function createBrowserSetupDiscoveryAttempt(
  source: ScreenshotSetupAttempt['source'],
  reason: ScreenshotSetupReason,
  driver: BrowserSetupDriver,
): ScreenshotSetupAttempt {
  return createSetupAttempt(source, reason, 'discovery', driver)
}

/** Creates the detached allowlisted source, stage, driver, and diagnostic fields. */
function createSetupAttempt(
  source: ScreenshotSetupAttempt['source'],
  reason: ScreenshotSetupReason,
  stage: ScreenshotSetupStage | undefined,
  driver: BrowserSetupDriver,
  diagnostic?: ScreenshotSetupDiagnostic,
): ScreenshotSetupAttempt {
  return {
    source,
    reason,
    ...(stage ? { stage } : {}),
    driver: { packageName: driver.packageName, version: driver.version },
    ...(diagnostic ? { diagnostic } : {}),
  }
}

/** Identifies Playwright's bounded launch timeout so the owner stops fallback. */
export function isBrowserSetupTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const value = error as { name?: unknown, message?: unknown, code?: unknown }
  return value.name === 'TimeoutError'
    || value.code === 'ETIMEDOUT'
    || (typeof value.message === 'string' && /^Timeout \d+ms exceeded\.?$/i.test(value.message))
}

/** Chooses the most actionable reason among the finite candidates examined. */
export function selectBrowserSetupFailureReason(attempts: readonly ScreenshotSetupAttempt[]): ScreenshotSetupReason {
  const priority: ScreenshotSetupReason[] = ['system-dependencies', 'permission', 'driver-version', 'unsupported-platform', 'browser-missing', 'startup-failed']
  return priority.find(reason => attempts.some(attempt => attempt.reason === reason)) ?? 'browser-missing'
}

/** Uses only generic messages; private paths and raw browser output stay internal. */
export function browserSetupFailureMessage(reason: ScreenshotSetupReason): string {
  if (reason === 'driver-missing') return 'Install a supported Playwright browser driver to capture screenshots'
  if (reason === 'driver-invalid') return 'The selected browser driver is invalid; check screenshot setup'
  if (reason === 'browser-missing') return 'No selected browser could start; check screenshot setup'
  if (reason === 'system-dependencies') return 'Browser system dependencies are missing'
  if (reason === 'permission') return 'The selected browser could not be started because of a permission problem'
  if (reason === 'driver-version') return 'The selected browser source requires a newer Playwright version'
  if (reason === 'unsupported-platform') return 'The selected browser source is not supported on this platform'
  return 'Browser startup failed; check screenshot setup'
}

/** Creates a public setup failure while retaining the existing transport code. */
export function createBrowserSetupPreviewError(
  reason: ScreenshotSetupReason,
  snapshot: import('@histoire/shared').ScreenshotSetupSnapshot,
): PreviewError {
  const dependency = reason === 'driver-missing' || reason === 'driver-invalid'
  return new PreviewError(dependency ? 'DEPENDENCY_MISSING' : 'BROWSER_UNAVAILABLE', browserSetupFailureMessage(reason), true, snapshot)
}

/** Creates a generic failure when refreshed metadata invalidated diagnosis. */
export function changedDuringAcquisition(): PreviewError {
  return new PreviewError('BROWSER_UNAVAILABLE', 'Screenshot browser setup changed during acquisition', true)
}

/** Rebuilds a fixed setup failure from a detached classified snapshot. */
export function browserSetupErrorFromSnapshot(snapshot: ScreenshotSetupSnapshot): PreviewError {
  return createBrowserSetupPreviewError(snapshot.reason ?? 'startup-failed', snapshot)
}

/** Recognizes cancellation, deadline, and runtime retirement as terminal. */
export function isTerminalBrowserSetupOperation(error: unknown, signal: AbortSignal, deadline: number): boolean {
  return signal.aborted
    || deadline <= Date.now()
    || (error instanceof PreviewError && (error.code === 'CANCELLED' || error.code === 'TIMEOUT'))
    || isBrowserSetupTimeout(error)
}

/** Returns one bounded fixed repair for a classified setup failure. */
export function getBrowserSetupRepairs(
  reason: ScreenshotSetupReason,
  policy: BrowserSetupPolicy,
  driverPackageName?: BrowserSetupPackage,
  platform: NodeJS.Platform = process.platform,
  driverVersion?: string,
): ScreenshotSetupRepair[] {
  switch (reason) {
    case 'driver-missing':
      return [repair('install-playwright', 'Install Playwright', 'playwright')]
    case 'browser-missing':
      return browserMissingRepair(policy, driverPackageName, driverVersion)
    case 'system-dependencies':
      return platform === 'linux'
        ? [repair('install-system-dependencies', 'Install Chromium system dependencies', driverCommand(driverPackageName, 'SystemDependencies'))]
        : [repair('check-setup', 'Check browser system dependencies')]
    case 'driver-version':
      return driverPackageName
        ? [upgradeDriverRepair(driverPackageName)]
        : [repair('restart-histoire', 'Restart Histoire after changing Playwright')]
    case 'driver-invalid':
      return [repair('check-setup', 'Check the selected Playwright installation')]
    case 'permission':
      return [repair('check-setup', 'Check browser executable permissions')]
    case 'unsupported-platform':
      return [repair('check-setup', 'Choose a browser supported on this platform')]
    case 'startup-failed':
      return [repair('check-setup', 'Check screenshot browser setup')]
  }
}

/** Selects the smallest source-aware install guidance after browser absence. */
function browserMissingRepair(policy: BrowserSetupPolicy, driverPackageName?: BrowserSetupPackage, driverVersion?: string): ScreenshotSetupRepair[] {
  if (policy.source === 'executable') return [repair('check-setup', 'Check the configured browser executable')]
  if (policy.source === 'chrome') return [repair('check-setup', 'Install stable Google Chrome or choose another browser source')]
  if (policy.source === 'msedge') return [repair('check-setup', 'Install stable Microsoft Edge or choose another browser source')]
  if (policy.source === 'chromium') {
    const command = driverCommand(driverPackageName, 'FullChromium')
    return [repair('install-full-chromium', 'Install full Chromium and select browser source chromium', command)]
  }
  if (driverVersion && !supportsSeparatedHeadlessShell(driverVersion)) return [upgradeDriverRepair(driverPackageName)]
  return driverPackageName === 'playwright-core'
    ? [repair('install-core-shell', 'Install Chromium headless shell', 'playwrightCoreShell')]
    : [repair('install-shell', 'Install Chromium headless shell', 'playwrightShell')]
}

/** Gives a fixed package-specific upgrade for legacy driver limitations. */
function upgradeDriverRepair(packageName?: BrowserSetupPackage): ScreenshotSetupRepair {
  return packageName === 'playwright-core'
    ? repair('upgrade-playwright', 'Upgrade Playwright Core', 'playwrightCoreUpgrade')
    : repair('upgrade-playwright', 'Upgrade Playwright', 'playwrightUpgrade')
}

/** Creates one fixed repair with a cloned allowlisted command specification. */
function repair(id: ScreenshotSetupRepairId, label: string, command?: ScreenshotSetupCommandKey): ScreenshotSetupRepair {
  return { id, label, ...(command ? { command: getScreenshotSetupCommand(command) } : {}) }
}

/** Selects the resolved driver's CLI for browser installation commands. */
function driverCommand(packageName: BrowserSetupPackage | undefined, action: 'SystemDependencies' | 'FullChromium'): ScreenshotSetupCommandKey {
  if (packageName === 'playwright-core') return action === 'SystemDependencies' ? 'playwrightCoreSystemDependencies' : 'playwrightCoreFullChromium'
  return action === 'SystemDependencies' ? 'playwrightSystemDependencies' : 'playwrightFullChromium'
}
