import type { SCREENSHOT_SETUP_SIGNALS } from '../screenshot-setup.js'

/** Finite browser source safe for setup status and diagnostics. */
export type ScreenshotBrowserSource = 'headless-shell' | 'chromium' | 'chrome' | 'msedge' | 'executable'

/** Public setup status. */
export type ScreenshotSetupState = 'unverified' | 'checking' | 'ready' | 'needs-action'

/** Fixed setup reason codes safe to expose to clients. */
export type ScreenshotSetupReason =
  | 'driver-missing'
  | 'driver-invalid'
  | 'browser-missing'
  | 'driver-version'
  | 'system-dependencies'
  | 'permission'
  | 'unsupported-platform'
  | 'startup-failed'

/** Finite cross-platform process signal names accepted in setup diagnostics. */
export type ScreenshotSetupSignal = typeof SCREENSHOT_SETUP_SIGNALS[number]

/** Stage where a candidate failed before story navigation. */
export type ScreenshotSetupStage = 'discovery' | 'launch' | 'probe'

/** Safe optional identity for the driver that failed this candidate. */
export interface ScreenshotSetupDriverIdentity {
  /** Optional supported package name; no resolved path is exposed. */
  packageName: 'playwright' | 'playwright-core'
  /** Bounded semantic version from the selected package manifest. */
  version: string
}

/** Bounded diagnostic detail with no free-form messages or paths. */
export type ScreenshotSetupDiagnostic =
  | { code: 'process-exited', exitCode?: number, signal?: ScreenshotSetupSignal }
  | { code: 'missing-library', library: string }
  | { code: 'executable-format' | 'sandbox-denied' | 'invalid-probe-image' | 'protocol-error' | 'unknown' }

/** One bounded failed browser attempt with optional safe failure evidence. */
export interface ScreenshotSetupAttempt {
  /** Finite renderer that failed. */
  source: ScreenshotBrowserSource
  /** Classified failure, without private stderr or paths. */
  reason: ScreenshotSetupReason
  /** Operation stage that produced the failure. */
  stage?: ScreenshotSetupStage
  /** Bounded driver identity; never includes a package path. */
  driver?: ScreenshotSetupDriverIdentity
  /** Machine-readable diagnosis; never includes logs or arbitrary text. */
  diagnostic?: ScreenshotSetupDiagnostic
}

/** Fixed repair actions permitted by setup reporting. */
export type ScreenshotSetupRepairId =
  | 'install-playwright'
  | 'upgrade-playwright'
  | 'install-core-shell'
  | 'install-shell'
  | 'install-system-dependencies'
  | 'install-full-chromium'
  | 'restart-histoire'
  | 'check-setup'

/** Structured installer invocation; consumers must not shell-split it. */
export interface ScreenshotSetupCommand {
  /** Allowlisted package-manager or selected-driver command. */
  executable: string
  /** Fixed arguments for the selected repair. */
  args: string[]
}

/** One fixed, English repair instruction. */
export interface ScreenshotSetupRepair {
  /** Allowlisted repair identifier. */
  id: ScreenshotSetupRepairId
  /** Concise action label. */
  label: string
  /** Optional structured command for copying or CLI display. */
  command?: ScreenshotSetupCommand
}

/** Detached portable setup state; installed does not mean verified. */
export interface ScreenshotSetupSnapshot {
  /** Monotonic revision within a captured runtime generation. */
  revision: number
  /** Discovery, active probe, proven success, or required user action. */
  state: ScreenshotSetupState
  /** Selected browser after successful startup; absent otherwise. */
  source?: ScreenshotBrowserSource
  /** Fixed actionable category; absent for ready/checking. */
  reason?: ScreenshotSetupReason
  /** Failed candidates in deterministic attempt order, capped at four. */
  attempts: ScreenshotSetupAttempt[]
  /** Ordered fixed repairs, empty when ready. */
  repairs: ScreenshotSetupRepair[]
}
