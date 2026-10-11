import type {
  ScreenshotSetupDiagnostic,
  ScreenshotSetupReason,
  ScreenshotSetupSignal,
} from '@histoire/shared'
import { SCREENSHOT_SETUP_SIGNALS } from '@histoire/shared'

/** Concrete browser operation stages with classified Playwright failures. */
export type BrowserSetupFailureStage = 'launch' | 'probe'

/** Launch or neutral-probe diagnosis; continuation stays explicit and conservative. */
export interface BrowserSetupDiagnosis {
  /** Safe reason used by the existing setup repair projection. */
  reason?: ScreenshotSetupReason
  /** Fixed diagnostic object; never contains raw logs, errors, or paths. */
  diagnostic: ScreenshotSetupDiagnostic
  /** Whether the owner may test another candidate before story navigation. */
  continueCandidates: boolean
}

/** Marks failures produced by the public driver launch call. */
export class BrowserSetupLaunchError extends Error {
  /** Preserve private SDK cause for fixed classification inside the Node owner. */
  constructor(cause: unknown) {
    super('Browser candidate launch failed', { cause })
    this.name = 'BrowserSetupLaunchError'
  }
}

/** Marks failures produced by the neutral page probe. */
export class BrowserSetupProbeError extends Error {
  /** Keep the raw failure private while identifying its lifecycle stage. */
  constructor(cause: unknown) {
    super('Neutral browser probe failed', { cause })
    this.name = 'BrowserSetupProbeError'
  }
}

/** Marks invalid or incorrectly sized PNG output from the neutral probe. */
export class BrowserSetupInvalidProbeImageError extends Error {
  /** Retains parser detail only as an internal cause. */
  constructor(cause?: unknown) {
    super('Neutral browser probe returned an invalid image', cause === undefined ? undefined : { cause })
    this.name = 'BrowserSetupInvalidProbeImageError'
  }
}

/** Signal names accepted by the shared portable diagnostic contract. */
const OS_SIGNALS: ReadonlySet<string> = new Set<string>(SCREENSHOT_SETUP_SIGNALS)

/** Exact public Playwright envelope required before inspecting browser logs. */
const LAUNCH_LOG_HEADER = /^browserType\.launch: (?:Failed to launch the browser process\.|Target page, context or browser has been closed)\r?\nBrowser logs:\r?\n/
const KNOWN_PLAYWRIGHT_SGR = new RegExp(`${String.fromCharCode(0x1B)}\\[(?:2|22)m`, 'g')

/** Extracts only allowlisted facts from audited Playwright launch/probe errors. */
export function diagnoseBrowserSetupFailure(error: unknown, stage: BrowserSetupFailureStage): BrowserSetupDiagnosis {
  const errors = errorChain(error)
  const messages = errors.flatMap(value => typeof value.message === 'string' ? [value.message] : [])
  if (stage === 'probe') return diagnoseProbeFailure(errors, messages)
  return diagnoseLaunchFailure(errors, messages)
}

/** Returns safe diagnosis for failures from the neutral about:blank page. */
function diagnoseProbeFailure(errors: ErrorLike[], messages: string[]): BrowserSetupDiagnosis {
  if (errors.some(value => value.name === 'BrowserSetupInvalidProbeImageError')) {
    return { reason: 'startup-failed', diagnostic: { code: 'invalid-probe-image' }, continueCandidates: false }
  }
  if (messages.some(message => /^Protocol error \([A-Za-z][\w.]*\):/.test(message))) {
    return { reason: 'startup-failed', diagnostic: { code: 'protocol-error' }, continueCandidates: false }
  }
  return { diagnostic: { code: 'unknown' }, continueCandidates: false }
}

/** Returns safe diagnosis for failures from the selected driver's launch call. */
function diagnoseLaunchFailure(errors: ErrorLike[], messages: string[]): BrowserSetupDiagnosis {
  const launchMessage = messages.find(message => message.startsWith('browserType.launch:'))
  const logs = launchMessage ? getAuditedBrowserLogs(launchMessage) : undefined
  const library = logs?.map(parseMissingLibrary).find((value): value is string => value !== undefined)
  if (library) {
    return { reason: 'system-dependencies', diagnostic: { code: 'missing-library', library }, continueCandidates: true }
  }
  if (logs?.some(isKnownSandboxDenial)) {
    return { reason: 'permission', diagnostic: { code: 'sandbox-denied' }, continueCandidates: true }
  }
  if (isExecutableFormatFailure(errors, messages, launchMessage)) {
    return { reason: 'unsupported-platform', diagnostic: { code: 'executable-format' }, continueCandidates: true }
  }
  const processExit = logs?.map(parseProcessExit).find((value): value is Extract<ScreenshotSetupDiagnostic, { code: 'process-exited' }> => value !== undefined)
  if (processExit) {
    return { reason: 'startup-failed', diagnostic: processExit, continueCandidates: false }
  }

  const reason = classifyKnownLaunchFailure(errors, messages)
  if (reason) return { reason, diagnostic: { code: 'unknown' }, continueCandidates: true }
  return { diagnostic: { code: 'unknown' }, continueCandidates: false }
}

/** Parses a browser's strict shared-library loader line and returns only its basename. */
function parseMissingLibrary(line: string): string | undefined {
  const match = /^\[pid=\d+\]\[err\] [^\r\n:]+: error while loading shared libraries: (lib[\w+.-]+\.so(?:\.\d+)*): cannot open shared object file: No such file or directory$/.exec(line)
  return match?.[1] && match[1].length <= 128 ? match[1] : undefined
}

/** Parses Playwright's fixed process launcher exit record without retaining its pid. */
function parseProcessExit(line: string): Extract<ScreenshotSetupDiagnostic, { code: 'process-exited' }> | undefined {
  const normalized = line.replace(KNOWN_PLAYWRIGHT_SGR, '')
  const match = /^(?:\x20{2}- )?\[pid=\d+\] <process did exit: exitCode=(null|\d+), signal=(null|[A-Z0-9]+)>$/.exec(normalized)
  if (!match) return
  const result: { code: 'process-exited', exitCode?: number, signal?: ScreenshotSetupSignal } = { code: 'process-exited' }
  if (match[1] !== 'null') {
    const exitCode = Number(match[1])
    if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 0xFFFFFFFF) result.exitCode = exitCode
  }
  if (match[2] !== 'null' && OS_SIGNALS.has(match[2])) result.signal = match[2] as ScreenshotSetupSignal
  return result
}

/** Recognizes only known Chromium Linux sandbox denial records. */
function isKnownSandboxDenial(line: string): boolean {
  return /^\[pid=\d+\]\[err\] (?:\[ERROR:zygote_host_impl_linux\.cc\(\d+\)\] )?No usable sandbox!/.test(line)
    || /^\[pid=\d+\]\[err\] Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted(?: \(0x[\da-f]+\))?$/i.test(line)
}

/** Requires an ENOEXEC spawn error tied to the public launch error envelope. */
function isExecutableFormatFailure(errors: ErrorLike[], messages: string[], launchMessage?: string): boolean {
  const structuredSpawn = errors.some(value => value.code === 'ENOEXEC' && typeof value.message === 'string' && /^spawn .+ ENOEXEC$/.test(value.message))
  const launchSpawn = !!launchMessage && /^browserType\.launch: Failed to launch: Error: spawn .+ ENOEXEC$/.test(launchMessage)
  return (structuredSpawn && messages.some(message => message.startsWith('browserType.launch:'))) || launchSpawn
}

/** Preserves previously audited setup categories without returning SDK text. */
function classifyKnownLaunchFailure(errors: ErrorLike[], messages: string[]): ScreenshotSetupReason | undefined {
  if (messages.some(message => /^browserType\.launch: Executable doesn't exist at\b/i.test(message)
    || /^browserType\.launch: Chromium distribution '(?:chrome|msedge)' is not found(?: at [^\r\n]*)?(?:\r?\n|$)/i.test(message))) {
    return 'browser-missing'
  }
  if (messages.some(isMissingDependenciesBox)) return 'system-dependencies'
  if (messages.some(message => /^browserType\.launch: Failed to launch: Error: spawn .+ EACCES(?:\r?\n|$)/i.test(message))) return 'permission'
  if (hasSpawnPermissionError(errors, messages)) return 'permission'
  if (messages.some(message => /^browserType\.launch: Unknown channel "(?:chromium|chrome|msedge)"(?:$|[.\s:])/i.test(message))) return 'driver-version'
  if (messages.some(message => /^browserType\.launch: Chromium distribution '(?:chromium|chrome|msedge)' is not supported on (?:linux|win32|darwin|freebsd|openbsd|aix|sunos)(?:$|[.\s])/i.test(message))) return 'unsupported-platform'
}

/** Matches Playwright's boxed host-dependency diagnostic only. */
function isMissingDependenciesBox(message: string): boolean {
  return message.startsWith('browserType.launch:')
    && /(?:^|\r?\n)║\s*Host system is missing dependencies to run browsers\.\s*║(?:\r?\n|$)/.test(message)
}

/** Requires a structured spawn errno or audited Playwright permission frame. */
function hasSpawnPermissionError(errors: ErrorLike[], messages: string[]): boolean {
  const structuredSpawn = errors.some(value => value.code === 'EACCES' && typeof value.message === 'string' && /^spawn .+ EACCES$/.test(value.message))
  return (structuredSpawn && messages.some(message => message.startsWith('browserType.launch:')))
    || messages.some(message => /^browserType\.launch: Failed to launch: Error: spawn .+ EACCES(?:\r?\n|$)/i.test(message))
}

/** Collects a short causal chain without serializing any member to callers. */
function errorChain(error: unknown, seen = new Set<unknown>()): ErrorLike[] {
  if (seen.has(error) || seen.size >= 8 || typeof error !== 'object' || error === null) return []
  seen.add(error)
  const value = error as ErrorLike
  return [value, ...(value.cause ? errorChain(value.cause, seen) : []), ...(Array.isArray(value.errors) ? value.errors.flatMap(item => errorChain(item, seen)) : [])]
}

/** Returns only log rows within Playwright's audited launch-error envelope. */
function getAuditedBrowserLogs(message: string): string[] | undefined {
  const header = LAUNCH_LOG_HEADER.exec(message)
  if (!header || message.length > 64 * 1024) return
  return message.slice(header[0].length).split(/\r?\n/).filter(line => line.length <= 4_096)
}

interface ErrorLike {
  /** Standard causal link retained only inside the Node runtime. */
  cause?: unknown
  /** Aggregate causes from internally wrapped cleanup failures. */
  errors?: unknown[]
  /** Private SDK message used only for fixed-pattern matching. */
  message?: unknown
  /** Error class marker used for typed neutral probe failures. */
  name?: unknown
  /** Structured operating-system spawn error code. */
  code?: unknown
}
