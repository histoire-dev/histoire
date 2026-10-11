import type { ScreenshotSetupSnapshot } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { SCREENSHOT_SETUP_SIGNALS, serializeScreenshotSetupCommand } from '@histoire/shared'
import { z } from 'zod/v4'
import { parseBrowserSetupVersion } from '../../runtime/browser/setup/driver.js'

/** Per-feature result ceiling before the shared 64 KB channel limit. */
export const SCREENSHOT_SETUP_RESULT_BYTES = 8 * 1024

const requestId = z.string().min(1).max(256)

/** Exact read/check/refresh request; arbitrary browser options are forbidden. */
export const screenshotSetupRequestSchema = z.strictObject({
  requestId,
  action: z.enum(['read', 'check', 'refresh']),
})

/** Exact cancellation request, scoped by the originating socket in the handler. */
export const screenshotSetupCancelSchema = z.strictObject({ requestId })

const screenshotSetupSource = z.enum(['headless-shell', 'chromium', 'chrome', 'msedge', 'executable'])
const screenshotSetupReason = z.enum([
  'driver-missing',
  'driver-invalid',
  'browser-missing',
  'driver-version',
  'system-dependencies',
  'permission',
  'unsupported-platform',
  'startup-failed',
])
const screenshotSetupRepairId = z.enum([
  'install-playwright',
  'upgrade-playwright',
  'install-core-shell',
  'install-shell',
  'install-system-dependencies',
  'install-full-chromium',
  'restart-histoire',
  'check-setup',
])

const screenshotSetupStage = z.enum(['discovery', 'launch', 'probe'])
const screenshotSetupSignal = z.enum(SCREENSHOT_SETUP_SIGNALS)
const screenshotSetupAttemptDriver = z.strictObject({
  packageName: z.enum(['playwright', 'playwright-core']),
  version: z.string().min(1).max(64).refine(value => parseBrowserSetupVersion(value) !== null),
})
const screenshotSetupDiagnostic = z.discriminatedUnion('code', [
  z.strictObject({
    code: z.literal('process-exited'),
    exitCode: z.number().int().min(0).max(0xFFFFFFFF).optional(),
    signal: screenshotSetupSignal.optional(),
  }),
  z.strictObject({
    code: z.literal('missing-library'),
    library: z.string().min(6).max(128).regex(/^lib[\w.+-]*\.so(?:\.\d+)*$/),
  }),
  z.strictObject({ code: z.literal('executable-format') }),
  z.strictObject({ code: z.literal('sandbox-denied') }),
  z.strictObject({ code: z.literal('invalid-probe-image') }),
  z.strictObject({ code: z.literal('protocol-error') }),
  z.strictObject({ code: z.literal('unknown') }),
])
const screenshotSetupAttempt = z.strictObject({
  source: screenshotSetupSource,
  reason: screenshotSetupReason,
  stage: screenshotSetupStage.optional(),
  driver: screenshotSetupAttemptDriver.optional(),
  diagnostic: screenshotSetupDiagnostic.optional(),
})

const commandToken = z.string().min(1).max(48).regex(/^[\w.@=+-]+$/)
const screenshotSetupCommand = z.strictObject({
  executable: commandToken,
  args: z.array(commandToken).max(8),
}).superRefine((command, context) => {
  try {
    serializeScreenshotSetupCommand(command)
  }
  catch {
    context.addIssue({ code: 'custom', message: 'Screenshot setup command is not allowlisted' })
  }
})

/** Runtime guard keeping internal paths and unbounded diagnostics off the wire. */
export const screenshotSetupSnapshotSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  state: z.enum(['unverified', 'checking', 'ready', 'needs-action']),
  source: screenshotSetupSource.optional(),
  reason: screenshotSetupReason.optional(),
  attempts: z.array(screenshotSetupAttempt).max(4),
  repairs: z.array(z.strictObject({
    id: screenshotSetupRepairId,
    label: z.string().min(1).max(96),
    command: screenshotSetupCommand.optional(),
  })).max(8),
})

/** Copy only the finite portable DTO fields accepted by the UI contract. */
export function portableScreenshotSetupSnapshot(value: ScreenshotSetupSnapshot): ScreenshotSetupSnapshot {
  return screenshotSetupSnapshotSchema.parse(value) as ScreenshotSetupSnapshot
}

/** Include the Vite custom-event wrapper when bounding setup result receipts. */
export function isScreenshotSetupResultWithinBudget(result: unknown): boolean {
  try {
    const json = JSON.stringify({ type: 'custom', event: 'histoire:ui:screenshot-setup-result', data: result })
    return json !== undefined && Buffer.byteLength(json) <= SCREENSHOT_SETUP_RESULT_BYTES
  }
  catch {
    return false
  }
}
