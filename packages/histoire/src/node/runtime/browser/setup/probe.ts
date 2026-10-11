import type { Browser, BrowserContext } from 'playwright'
import { ExecutionError } from '../../execution-types.js'
import { PreviewError } from '../errors.js'
import { readPngDimensions } from '../png.js'
import { BrowserSetupInvalidProbeImageError } from './diagnostics.js'

/** Fixed neutral page dimensions; no story route or user source is loaded. */
const PROBE_VIEWPORT = Object.freeze({ width: 320, height: 240 })

/** Checks that one candidate can create a page and return a valid tiny PNG. */
export async function probeSetupBrowser(
  browser: Browser,
  options: { signal: AbortSignal, deadline: number, isActive: () => boolean, closeBrowser: () => Promise<unknown> },
): Promise<void> {
  let context: BrowserContext | undefined
  let failure: unknown
  try {
    checkProbeAuthority(options)
    context = await awaitBrowserApi(browser.newContext({ viewport: PROBE_VIEWPORT, deviceScaleFactor: 1 }), options, options.closeBrowser, value => value.close())
    checkProbeAuthority(options)
    const page = await awaitBrowserApi(context.newPage(), options, options.closeBrowser)
    checkProbeAuthority(options)
    await awaitBrowserApi(page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: remaining(options.deadline) }), options, options.closeBrowser)
    checkProbeAuthority(options)
    const png = await awaitBrowserApi(page.screenshot({ type: 'png', fullPage: false, timeout: remaining(options.deadline) }), options, options.closeBrowser)
    checkProbeAuthority(options)
    let dimensions: ReturnType<typeof readPngDimensions>
    try {
      dimensions = readPngDimensions(png)
    }
    catch (error) {
      throw new BrowserSetupInvalidProbeImageError(error)
    }
    if (dimensions.width !== PROBE_VIEWPORT.width || dimensions.height !== PROBE_VIEWPORT.height) {
      throw new BrowserSetupInvalidProbeImageError()
    }
  }
  catch (error) {
    failure = error
  }

  if (isTerminalSetupError(failure, options)) {
    try {
      await options.closeBrowser()
    }
    catch (error) {
      throw new ExecutionError('CLEANUP_UNCONFIRMED', 'Cancelled neutral browser cleanup could not be confirmed', failure ?? error)
    }
  }
  else if (context) {
    try {
      await awaitBrowserApi(context.close(), options, options.closeBrowser)
    }
    catch (error) {
      failure = isTerminalSetupError(error, options)
        ? error
        : new ExecutionError('CLEANUP_UNCONFIRMED', 'Neutral browser context cleanup could not be confirmed', error)
    }
  }
  if (failure) throw failure
}

/** Rejects stale, cancelled, or expired setup work before publishing success. */
function checkProbeAuthority(options: { signal: AbortSignal, deadline: number, isActive: () => boolean }): void {
  if (options.signal.aborted || !options.isActive()) throw new PreviewError('CANCELLED', 'Browser setup operation cancelled')
  if (options.deadline <= Date.now()) throw new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true)
}

/** Races browser APIs against ownership while closing, then observing late results. */
async function awaitBrowserApi<T>(
  work: Promise<T>,
  options: { signal: AbortSignal, deadline: number, isActive: () => boolean },
  closeBrowser: () => Promise<unknown>,
  closeLate?: (value: T) => Promise<unknown>,
): Promise<T> {
  const operation = Promise.resolve(work)
  void operation.catch(() => {})
  let rejectStop: ((error: unknown) => void) | undefined
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectStop = reject
  })
  const stopIfNeeded = () => {
    if (options.signal.aborted || !options.isActive()) rejectStop?.(new PreviewError('CANCELLED', 'Browser setup operation cancelled'))
    else if (options.deadline <= Date.now()) rejectStop?.(new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true))
  }
  const onAbort = () => stopIfNeeded()
  options.signal.addEventListener('abort', onAbort, { once: true })
  if (options.signal.aborted || !options.isActive()) stopIfNeeded()
  const interval = setInterval(stopIfNeeded, 20)
  const timer = setTimeout(stopIfNeeded, Math.max(1, options.deadline - Date.now()))
  try {
    const value = await Promise.race([operation, stopped])
    checkProbeAuthority(options)
    return value
  }
  catch (error) {
    const stop = setupAuthorityError(options) ?? error
    if (stop instanceof PreviewError && (stop.code === 'CANCELLED' || stop.code === 'TIMEOUT')) {
      try {
        await closeBrowser()
      }
      catch (cleanupError) {
        throw new ExecutionError('CLEANUP_UNCONFIRMED', 'Browser cleanup after a stopped probe could not be confirmed', cleanupError)
      }
      if (closeLate) void operation.then(value => closeLate(value)).catch(() => {})
      throw stop
    }
    throw error
  }
  finally {
    options.signal.removeEventListener('abort', onAbort)
    clearTimeout(timer)
    clearInterval(interval)
  }
}

/** Returns current cancellation or deadline failure without leaking abort reasons. */
function setupAuthorityError(options: { signal: AbortSignal, deadline: number, isActive: () => boolean }): PreviewError | undefined {
  if (options.signal.aborted || !options.isActive()) return new PreviewError('CANCELLED', 'Browser setup operation cancelled')
  if (options.deadline <= Date.now()) return new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true)
}

/** Distinguishes stop errors from setup failures that can be classified for fallback. */
function isTerminalSetupError(error: unknown, options: { signal: AbortSignal, deadline: number, isActive: () => boolean }): boolean {
  const authority = setupAuthorityError(options)
  return authority !== undefined || (error instanceof PreviewError && (error.code === 'CANCELLED' || error.code === 'TIMEOUT'))
}

/** Returns a positive Playwright timeout while preserving the shared deadline. */
function remaining(deadline: number): number {
  const value = deadline - Date.now()
  if (value <= 0) throw new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true)
  return value
}
