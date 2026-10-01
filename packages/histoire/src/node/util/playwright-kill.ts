/**
 * Minimal shape of the OS process spawned for a Playwright browser.
 */
interface BrowserChildProcessLike {
  pid?: number
  killed?: boolean
  kill?: (signal?: NodeJS.Signals) => boolean
}

/**
 * Browser handles already force-killed, so calling the fallback twice for the
 * same run (or for a browser shared by several projects) stays a no-op.
 */
const killedBrowsers = new WeakSet<object>()

/**
 * Reaches the OS process backing a Playwright browser handle.
 *
 * Playwright's public client API exposes no process handle, but the `playwright`
 * package runs its server side in the same Node process, so the client
 * connection can map a client object back to its server implementation
 * (`toImpl`) — and that implementation owns the spawned browser process.
 * Undefined for remote browsers (`connect`), where no local process exists.
 * @param browser The Playwright client `Browser` instance.
 */
export function getPlaywrightBrowserProcess(browser: unknown): BrowserChildProcessLike | undefined {
  try {
    const impl = (browser as any)?._connection?.toImpl?.(browser)
    const child = impl?.options?.browserProcess?.process
    return typeof child?.pid === 'number' ? child : undefined
  }
  catch {
    // Internals are version-specific: an unexpected shape means "not reachable",
    // never a cleanup failure.
    return undefined
  }
}

/**
 * Force-kills the browser process behind a Playwright browser handle.
 *
 * Last resort for a browser whose graceful `close()` is stuck: without it a
 * long-lived dev server would strand one headless browser per timed-out run.
 * Never throws and is idempotent per browser handle.
 * @param browser The Playwright client `Browser` instance.
 * @returns Whether a process was actually signalled.
 */
export function forceKillPlaywrightBrowser(browser: unknown): boolean {
  if (!browser || typeof browser !== 'object' || killedBrowsers.has(browser)) {
    return false
  }

  const child = getPlaywrightBrowserProcess(browser)
  if (!child?.pid || child.killed) {
    return false
  }

  // Mark before signalling: a failed kill must not be retried on every
  // subsequent cleanup either.
  killedBrowsers.add(browser)

  try {
    if (process.platform === 'win32') {
      // No process groups on Windows; Chromium's job object takes the renderer
      // children down with the browser process.
      return child.kill?.('SIGKILL') ?? false
    }

    // Playwright spawns the browser detached, so it leads its own process
    // group: killing the group also reaps Chromium's renderer children.
    process.kill(-child.pid, 'SIGKILL')
    return true
  }
  catch {
    try {
      return child.kill?.('SIGKILL') ?? false
    }
    catch {
      return false
    }
  }
}
