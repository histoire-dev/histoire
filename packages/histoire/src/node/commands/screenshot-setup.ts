import type { HistoireConfig, ScreenshotSetupSnapshot } from '@histoire/shared'
import { realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serializeScreenshotSetupCommand } from '@histoire/shared'
import { loadConfigFile, resolveConfigFile } from '../config/load.js'
import { PreviewError } from '../runtime/browser/errors.js'
import { createScreenshotSetupOwner } from '../runtime/browser/setup/owner.js'
import { createBrowserSetupPolicy } from '../runtime/browser/setup/policy.js'
import { classifyBrowserSetupFailure } from '../runtime/browser/setup/report.js'
import { createExecutionService } from '../runtime/execution-service.js'

export { reportInvalidScreenshotSetupArguments, validateScreenshotSetupArguments } from './screenshot-setup-args.js'

/** Options accepted by the metadata-only setup command. */
export interface ScreenshotSetupOptions {
  /** Project root; defaults to the current working directory. */
  root?: string
  /** Trusted Histoire config path, resolved from the selected root. */
  config?: string
  /** Explicitly launch and release one bounded setup probe. */
  check?: boolean
  /** Emit one JSON snapshot or bounded error object to stdout. */
  json?: boolean
}

const setupDeadlineMs = 15_000

/** Run a callback while discarding untrusted config-import output. */
async function withoutConfigOutput<T>(callback: () => Promise<T>): Promise<T> {
  const originalStdout = process.stdout.write
  const originalStderr = process.stderr.write
  const discardWrite = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
    const done = typeof encoding === 'function' ? encoding : callback
    if (typeof done === 'function') done()
    return true
  }) as typeof process.stdout.write
  process.stdout.write = discardWrite
  process.stderr.write = discardWrite
  try {
    return await callback()
  }
  finally {
    process.stdout.write = originalStdout
    process.stderr.write = originalStderr
  }
}

const sourceLabels = {
  'headless-shell': 'Chromium headless shell',
  'chromium': 'Chromium',
  'chrome': 'Google Chrome',
  'msedge': 'Microsoft Edge',
  'executable': 'Configured browser',
} satisfies Record<NonNullable<ScreenshotSetupSnapshot['source']>, string>

const reasonLabels = {
  'driver-missing': 'No supported screenshot driver is installed.',
  'driver-invalid': 'The installed screenshot driver could not be used.',
  'browser-missing': 'No compatible browser was found.',
  'driver-version': 'The screenshot driver version is incompatible.',
  'system-dependencies': 'Required operating system libraries are missing.',
  'permission': 'The browser could not start because of a permission error.',
  'unsupported-platform': 'Screenshot setup is unavailable on this platform.',
  'startup-failed': 'The browser could not start.',
} satisfies Record<NonNullable<ScreenshotSetupSnapshot['reason']>, string>

/** Write one line to stdout without adding CLI progress to JSON output. */
function writeLine(value: string): void {
  process.stdout.write(`${value}\n`)
}

/** Print a portable snapshot as JSON or concise setup guidance. */
function printSnapshot(snapshot: ScreenshotSetupSnapshot, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(snapshot)}\n`)
    return
  }

  if (snapshot.state === 'ready') {
    writeLine('Screenshot setup: Ready')
    if (snapshot.source) writeLine(`Selected browser: ${sourceLabels[snapshot.source]}`)
    return
  }

  if (snapshot.state === 'needs-action') {
    writeLine('Screenshot setup: Needs action')
    if (snapshot.reason) writeLine(reasonLabels[snapshot.reason])
  }
  else {
    writeLine('Screenshot setup: Unverified')
    if (snapshot.source) writeLine(`Potential browser: ${sourceLabels[snapshot.source]}`)
  }

  for (const repair of snapshot.repairs) {
    writeLine(`- ${repair.label}`)
    if (repair.command) writeLine(`  ${serializeScreenshotSetupCommand(repair.command)}`)
  }
}

/** Emit one bounded JSON error object when no portable setup snapshot exists. */
function printError(code: 'invalid' | 'unavailable', message: string, json: boolean): void {
  if (json) process.stdout.write(`${JSON.stringify({ error: { code, message } })}\n`)
  else console.error(message)
}

/** Read only the trusted Histoire config file; do not resolve or start Vite. */
async function loadSetupPolicy(root: string, configPath?: string) {
  const file = resolveConfigFile(root, configPath)
  const config = file
    ? await withoutConfigOutput(() => loadConfigFile(file))
    : {} as Partial<HistoireConfig>
  return createBrowserSetupPolicy(config.browser, root)
}

/** Accept only owner-attached or audited launch failures as actionable snapshots. */
function setupFailureSnapshot(error: unknown, owner: ReturnType<typeof createScreenshotSetupOwner>): ScreenshotSetupSnapshot | undefined {
  if (error instanceof PreviewError) {
    const setup = error.setup
    if (setup?.state === 'needs-action') return setup
  }
  if (!classifyBrowserSetupFailure(error)) return undefined
  const snapshot = owner.getSnapshot()
  return snapshot.state === 'needs-action' ? snapshot : undefined
}

/** Validate inputs, discover setup metadata, and optionally run one finite probe. */
export async function screenshotSetupCommand(options: ScreenshotSetupOptions): Promise<number> {
  const json = options.json === true
  let owner: ReturnType<typeof createScreenshotSetupOwner> | undefined
  let execution: ReturnType<typeof createExecutionService> | undefined
  let snapshot: ScreenshotSetupSnapshot | undefined
  let failureMessage: string | undefined
  let failureCode: 'invalid' | 'unavailable' = 'invalid'
  let exitCode = 2

  try {
    const root = await realpath(resolve(options.root ?? process.cwd()))
    if (!(await stat(root)).isDirectory()) throw new Error('Screenshot setup root must be an existing directory')
    const policy = await loadSetupPolicy(root, options.config)
    owner = createScreenshotSetupOwner({ root, policy })

    if (options.check) {
      execution = createExecutionService({ cleanupTimeoutMs: setupDeadlineMs })
      const handle = execution.enqueue({
        run: async (signal) => {
          const lease = await owner!.acquire(signal, Date.now() + setupDeadlineMs)
          try {
            return owner!.getSnapshot()
          }
          finally {
            await lease.release()
          }
        },
      })
      let probeError: unknown
      try {
        await handle.result
      }
      catch (error) {
        probeError = error
      }
      if (probeError) {
        snapshot = setupFailureSnapshot(probeError, owner)
        if (!snapshot) {
          failureCode = 'unavailable'
          failureMessage = 'Screenshot setup check did not finish cleanly.'
        }
      }
      else {
        snapshot = owner.getSnapshot()
      }
    }
    else {
      snapshot = await owner.discover()
    }
  }
  catch {
    if (owner) {
      failureCode = 'unavailable'
      failureMessage = 'Screenshot setup check did not finish cleanly.'
    }
    else {
      failureCode = 'invalid'
      failureMessage = 'Invalid screenshot setup root or configuration.'
    }
  }
  finally {
    try {
      await execution?.close()
    }
    catch {
      failureCode = 'unavailable'
      failureMessage = 'Screenshot setup resources could not be closed safely.'
    }
    try {
      await owner?.close()
    }
    catch {
      failureCode = 'unavailable'
      failureMessage = 'Screenshot setup resources could not be closed safely.'
    }
  }

  if (failureMessage) {
    printError(failureCode, failureMessage, json)
    exitCode = failureCode === 'invalid' ? 2 : 1
  }
  else if (snapshot) {
    printSnapshot(snapshot, json)
    exitCode = options.check ? (snapshot.state === 'ready' ? 0 : 1) : (snapshot.state === 'needs-action' ? 1 : 0)
  }

  process.exitCode = exitCode
  return exitCode
}
