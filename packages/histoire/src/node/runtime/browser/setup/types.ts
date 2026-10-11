import type {
  HistoireBrowserSource,
  ScreenshotBrowserSource,
  ScreenshotSetupReason,
  ScreenshotSetupSnapshot,
} from '@histoire/shared'
import type { Browser, LaunchOptions } from 'playwright'

/** State distinguishing proven browser presence from public-API uncertainty. */
export type BrowserPresence = 'present' | 'absent' | 'unknown'

/** Package names accepted as optional isolated screenshot drivers. */
export type BrowserSetupPackage = 'playwright' | 'playwright-core'

/** Normalized, immutable policy for one Histoire project. */
export interface BrowserSetupPolicy {
  /** Requested source, defaulting to automatic selection. */
  readonly source: HistoireBrowserSource
  /** Absolute configured executable path for explicit source only. */
  readonly executablePath?: string
  /** Enables generation-scoped process reuse; omitted when disabled. */
  readonly reuse?: true
  /** Maximum idle lifetime for a retained process. */
  readonly idleTimeoutMs?: number
}

/** Public launch surface retained from one privately resolved driver. */
export interface BrowserSetupChromium {
  /** Launch a local isolated browser using structured Playwright options. */
  launch: (options: LaunchOptions) => Promise<Browser>
  /** Return this driver's public default Chromium executable path. */
  executablePath: () => string
}

/** Resolved driver identity and supported public browser API. */
export interface BrowserSetupDriver {
  /** Selected package identity, private to Node runtime. */
  readonly packageName: BrowserSetupPackage
  /** Real path of the imported package entry. */
  readonly resolvedPath: string
  /** Version read from that package's own manifest. */
  readonly version: string
  /** Chromium methods required by discovery and acquisition. */
  readonly chromium: BrowserSetupChromium
}

/** Private resolved package identity usable without importing its code. */
export interface BrowserSetupDriverIdentity {
  /** Selected package identity. */
  readonly packageName: BrowserSetupPackage
  /** Real path of the selected package entry. */
  readonly resolvedPath: string
  /** Version read from that package's own manifest. */
  readonly version: string
  /** Whether resolution found the project-visible install or Histoire fallback. */
  readonly resolvedFrom: 'project' | 'histoire'
}

/** Metadata-only optional driver resolution result. */
export type BrowserSetupDriverIdentityDiscovery =
  | { readonly status: 'available', readonly identity: BrowserSetupDriverIdentity }
  | { readonly status: 'missing', readonly reason: 'driver-missing' }
  | { readonly status: 'invalid', readonly reason: 'driver-invalid', readonly packageName: BrowserSetupPackage }

/** Runtime optional driver resolution result, including process-cache version conflicts. */
export type BrowserSetupDriverDiscovery =
  | { readonly status: 'available', readonly driver: BrowserSetupDriver }
  | { readonly status: 'missing', readonly reason: 'driver-missing' }
  | { readonly status: 'invalid', readonly reason: 'driver-invalid' | 'driver-version', readonly packageName: BrowserSetupPackage }

/** Ordered renderer candidate; its launch options remain structured. */
export interface BrowserSetupCandidate {
  /** Finite renderer identity safe for later setup projection. */
  readonly source: ScreenshotBrowserSource
  /** Options passed directly to the selected driver's `chromium.launch`. */
  readonly launchOptions: LaunchOptions
  /** Publicly proven availability, known absence, or shell uncertainty. */
  readonly presence: BrowserPresence
  /** Known driver limitation that prevents launch for this source. */
  readonly unavailableReason?: ScreenshotSetupReason
}

/** Browser acquisition owned by one runtime operation. */
export interface CaptureBrowserLease {
  /** Browser tested before any story navigation. */
  browser: Browser
  /** Renderer selected under trusted policy. */
  source: ScreenshotBrowserSource
  /** Idempotent release; confirms cleanup or rejects. */
  release: () => Promise<void>
  /** Discards exact browser process when fresh-context cleanup is uncertain. */
  discard?: () => Promise<void>
}

/** Generation-scoped setup state and owned acquisition. */
export interface ScreenshotSetupOwner {
  /** Metadata discovery only; never launches. */
  discover: () => Promise<ScreenshotSetupSnapshot>
  /** Acquires a proven browser under caller's signal and absolute deadline. */
  acquire: (signal: AbortSignal, deadline: number) => Promise<CaptureBrowserLease>
  /** Clears dependency absence, candidates, and probe receipt; preserves policy. */
  invalidate: () => void
  /** Detached immutable current observation. */
  getSnapshot: () => ScreenshotSetupSnapshot
  /** Subscribes to current owner's observations and returns a disposer. */
  subscribe: (listener: (value: ScreenshotSetupSnapshot) => void) => () => void
  /** Terminal owner shutdown; awaits owned cleanup. */
  close: () => Promise<void>
}
