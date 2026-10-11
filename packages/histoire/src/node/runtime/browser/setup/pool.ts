import type { Browser } from 'playwright'
import { closePreviewBrowser } from '../cleanup.js'

/** Pool-owned process lease; callers still create and close a fresh context per operation. */
export interface BrowserProcessLease {
  /** The exact connected Playwright browser assigned to this operation. */
  readonly browser: Browser
  /** Returns a healthy browser to the idle pool after operation cleanup succeeds. */
  release: () => Promise<void>
  /** Closes this browser immediately when operation cleanup is uncertain. */
  discard: () => Promise<void>
}

/** One generation-scoped browser process pool owned by a setup owner. */
export interface BrowserProcessPool {
  /** Acquires the retained browser or lazily launches one when none is reusable. */
  acquire: (launch: () => Promise<Browser>) => Promise<BrowserProcessLease>
  /** Stops future acquisitions; an in-flight operation remains usable until release. */
  retire: () => Promise<void>
  /** Stops admission and confirms cleanup of current or late-acquired browser. */
  close: () => Promise<void>
}

/** Dependencies for one private browser process pool. */
export interface BrowserProcessPoolOptions {
  /** Healthy process lifetime after its last operation releases the lease. */
  readonly idleTimeoutMs: number
  /** Confirmed Playwright process cleanup; production uses the shared cleanup helper. */
  readonly closeBrowser?: (browser: Browser) => Promise<unknown>
  /** Invalidates the owner's candidate receipt after an unexpected browser exit. */
  readonly onBrowserDisconnected?: (browser: Browser) => void
  /** Reports cleanup uncertainty even when idle expiry closes the process in background. */
  readonly onCleanupFailure?: (error: unknown) => void
}

/** Creates one reusable browser process while preserving exclusive operation leases. */
export function createBrowserProcessPool(options: BrowserProcessPoolOptions): BrowserProcessPool {
  const closeBrowser = options.closeBrowser ?? (browser => closePreviewBrowser(browser))
  let browser: Browser | undefined
  let unavailableBrowser: Browser | undefined
  let removeDisconnectListener: (() => void) | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let closingBrowser: Browser | undefined
  let closing: Promise<void> | undefined
  let launching: Promise<Browser> | undefined
  let terminalClose: Promise<void> | undefined
  let retirement: Promise<void> | undefined
  let cleanupFailure: unknown
  let hasCleanupFailure = false
  let acquiring = false
  let leased = false
  let retired = false
  let closed = false

  /** Stops an idle timer before any state transition that changes ownership. */
  function clearIdleTimer() {
    clearTimeout(idleTimer)
    idleTimer = undefined
  }

  /** Detaches this pool's disconnect observation from its current browser. */
  function unwatchDisconnect() {
    removeDisconnectListener?.()
    removeDisconnectListener = undefined
  }

  /** Reads Playwright connection state defensively after a process crash. */
  function isConnected(owned: Browser): boolean {
    try {
      return owned.isConnected()
    }
    catch {
      return false
    }
  }

  /** Marks an unexpected process exit so a later explicit operation must launch again. */
  function watchDisconnect(owned: Browser) {
    const onDisconnected = () => {
      if (browser !== owned) return
      browser = undefined
      unavailableBrowser = owned
      clearIdleTimer()
      unwatchDisconnect()
      try {
        options.onBrowserDisconnected?.(owned)
      }
      catch {
        // Owner observation must not make Playwright's disconnect event fail.
      }
      if (!leased) void disposeUnavailable(owned).catch(() => {})
    }
    owned.on('disconnected', onDisconnected)
    removeDisconnectListener = () => owned.off('disconnected', onDisconnected)
  }

  /** Begins one serialized confirmed close and permanently blocks reuse on failure. */
  function beginClose(owned: Browser): Promise<void> {
    if (closing) {
      if (closingBrowser === owned) return closing
      return closing.then(() => beginClose(owned))
    }

    closingBrowser = owned
    const closingTask = Promise.resolve()
      .then(() => closeBrowser(owned))
      .then(() => undefined)
      .catch((error: unknown) => {
        hasCleanupFailure = true
        cleanupFailure = error
        try {
          options.onCleanupFailure?.(error)
        }
        catch {
          // Owner quarantine observation must not replace the exact cleanup failure.
        }
        throw error
      })
      .finally(() => {
        if (closing === closingTask) {
          closing = undefined
          closingBrowser = undefined
        }
      })
    closing = closingTask
    return closingTask
  }

  /** Removes the pooled handle before waiting for its exact process to close. */
  function disposeCurrent(owned: Browser): Promise<void> {
    if (browser !== owned) return closing ?? Promise.resolve()
    clearIdleTimer()
    browser = undefined
    unwatchDisconnect()
    return beginClose(owned)
  }

  /** Confirms cleanup for a disconnected handle before another process can launch. */
  function disposeUnavailable(owned: Browser): Promise<void> {
    if (unavailableBrowser !== owned) return closing ?? Promise.resolve()
    unavailableBrowser = undefined
    unwatchDisconnect()
    return beginClose(owned)
  }

  /** Starts idle expiry only after the final operation has returned its lease. */
  function scheduleIdleClose(owned: Browser) {
    clearIdleTimer()
    idleTimer = setTimeout(() => {
      if (browser !== owned || leased || closed) return
      void disposeCurrent(owned).catch(() => {})
    }, options.idleTimeoutMs)
    idleTimer.unref?.()
  }

  /** Rejects acquisition after owner retirement or cleanup uncertainty. */
  function assertCanAcquire() {
    if (closed) throw new Error('Browser process pool is closed')
    if (retired) throw new Error('Browser process pool is retired')
    if (hasCleanupFailure) throw cleanupFailure
  }

  /** Keeps an acquisition already admitted before retirement usable. */
  function assertOperationHealthy() {
    if (closed) throw new Error('Browser process pool is closed')
    if (hasCleanupFailure) throw cleanupFailure
  }

  /** Assigns the sole active lease and makes its terminal action idempotent. */
  function createLease(owned: Browser): BrowserProcessLease {
    leased = true
    let settled: Promise<void> | undefined
    return {
      browser: owned,
      release: () => {
        if (settled) return settled
        leased = false
        if (closed) return settled = terminalClose ?? Promise.resolve()
        if (hasCleanupFailure) return settled = Promise.reject(cleanupFailure)
        if (retired && browser === owned) return settled = disposeCurrent(owned)
        if (retired && unavailableBrowser === owned) return settled = disposeUnavailable(owned)
        if (browser === owned && isConnected(owned)) scheduleIdleClose(owned)
        else if (unavailableBrowser === owned) return settled = disposeUnavailable(owned)
        return settled = Promise.resolve()
      },
      discard: () => {
        if (settled) return settled
        leased = false
        if (browser === owned) return settled = disposeCurrent(owned)
        if (unavailableBrowser === owned) return settled = disposeUnavailable(owned)
        if (closed) return settled = terminalClose ?? Promise.resolve()
        if (hasCleanupFailure) return settled = Promise.reject(cleanupFailure)
        return settled = Promise.resolve()
      },
    }
  }

  /** Acquires exclusively, joining an in-flight close before starting a replacement. */
  async function acquire(launch: () => Promise<Browser>): Promise<BrowserProcessLease> {
    assertCanAcquire()
    if (leased || acquiring) throw new Error('Browser process pool already has an active acquisition')
    acquiring = true
    clearIdleTimer()
    try {
      if (closing) await closing
      assertOperationHealthy()

      let selected = browser
      if (selected && !isConnected(selected)) {
        browser = undefined
        unwatchDisconnect()
        unavailableBrowser = selected
        selected = undefined
      }
      if (unavailableBrowser) await disposeUnavailable(unavailableBrowser)
      if (closing) await closing
      assertOperationHealthy()

      if (!selected) {
        const launchTask = Promise.resolve().then(launch)
        launching = launchTask
        try {
          selected = await launchTask
        }
        finally {
          if (launching === launchTask) launching = undefined
        }
        assertOperationHealthy()
        browser = selected
        watchDisconnect(selected)
      }

      assertOperationHealthy()
      if (browser !== selected || !isConnected(selected)) {
        if (browser === selected) {
          browser = undefined
          unwatchDisconnect()
        }
        unavailableBrowser = selected
        await disposeUnavailable(selected)
        throw new Error('Browser disconnected before its operation lease was assigned')
      }
      return createLease(selected)
    }
    finally {
      acquiring = false
    }
  }

  /** Retires idle state while preserving a lease admitted before the generation changed. */
  function retire(): Promise<void> {
    if (retirement) return retirement
    retired = true
    clearIdleTimer()
    const owned = browser ?? unavailableBrowser
    if (owned && !leased && !acquiring) {
      retirement = browser === owned ? disposeCurrent(owned) : disposeUnavailable(owned)
      return retirement
    }
    retirement = Promise.resolve()
    return retirement
  }

  /** Retires the pool synchronously, then closes resources acquired before shutdown. */
  function close(): Promise<void> {
    if (terminalClose) return terminalClose
    closed = true
    retired = true
    clearIdleTimer()
    const pendingClose = closing
    const pendingLaunch = launching
    const owned = browser ?? unavailableBrowser
    if (owned) {
      browser = undefined
      unavailableBrowser = undefined
      unwatchDisconnect()
    }

    terminalClose = (async () => {
      if (pendingClose) await pendingClose
      else if (owned) await beginClose(owned)

      if (pendingLaunch) {
        const lateBrowser = await pendingLaunch.catch(() => undefined)
        if (lateBrowser && lateBrowser !== owned) await beginClose(lateBrowser)
      }
      if (hasCleanupFailure) throw cleanupFailure
    })()
    return terminalClose
  }

  return { acquire, retire, close }
}
