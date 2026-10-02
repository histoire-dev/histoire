import type { ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { ExecutionError } from '../runtime/execution-types.js'
import { forceKillPlaywrightBrowser, getPlaywrightBrowserProcess } from './playwright-kill.js'

/** Confirmed browser ownership outcomes; unknown shutdown rejects. */
export type PlaywrightCleanupOutcome = 'graceful' | 'forced'

/** Probe only captured browser process, never global Chromium counts. */
function processExited(child: ChildProcess | undefined): boolean {
  if (!child?.pid) return false
  if (child.exitCode !== null && child.exitCode !== undefined) return true
  if (child.signalCode) return true
  try {
    process.kill(child.pid, 0)
    return false
  }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' }
}

/** Signal owned process and require observed exit, including after concurrent close. */
export async function terminatePlaywrightBrowser(browser: unknown, timeoutMs = 2500, capturedProcess?: ReturnType<typeof getPlaywrightBrowserProcess>): Promise<'forced'> {
  const child = (capturedProcess ?? getPlaywrightBrowserProcess(browser)) as ChildProcess | undefined
  forceKillPlaywrightBrowser(browser, child)
  const until = Date.now() + Math.max(1, timeoutMs)
  do {
    if (processExited(child)) return 'forced'
    await delay(20)
  } while (Date.now() < until)
  throw new ExecutionError('CLEANUP_UNCONFIRMED', 'Playwright browser cleanup could not be confirmed')
}

/** Bound graceful close and confirm a signalled fallback really exited. */
export async function closePlaywrightBrowser(browser: { close: () => unknown | Promise<unknown> }, timeoutMs = 5000): Promise<PlaywrightCleanupOutcome> {
  const child = getPlaywrightBrowserProcess(browser)
  let timer: ReturnType<typeof setTimeout> | undefined
  const closing = Promise.resolve().then(() => browser.close())
  void closing.catch(() => {})
  try {
    const result = await Promise.race([
      closing.then(() => true, () => false),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), Math.max(1, Math.floor(timeoutMs / 2))) }),
    ])
    if (result) return 'graceful'
  }
  finally { clearTimeout(timer) }
  return terminatePlaywrightBrowser(browser, Math.max(1, Math.floor(timeoutMs / 2)), child)
}
