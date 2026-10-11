import type { Browser } from 'playwright'
import type { BrowserSetupCandidate, BrowserSetupDriver } from './types.js'
import { closePreviewBrowser } from '../cleanup.js'
import { PreviewError } from '../errors.js'
import { acquireSetupBrowser } from './acquire.js'
import { type BrowserProcessLease, type BrowserProcessPool, createBrowserProcessPool } from './pool.js'

/** Owner for private pools keyed by one driver, source, and generation. */
export interface BrowserReuseManager {
  /** Acquires only from the exact key, retiring a previous generation first. */
  acquire: (key: string, launch: () => Promise<Browser>) => Promise<BrowserProcessLease>
  /** Retires the current pool without interrupting an already-issued lease. */
  invalidate: () => void
  /** Confirms cleanup of the current pool and any completed retirements. */
  close: () => Promise<void>
}

/** Dependencies for generation-scoped optional browser reuse. */
export interface BrowserReuseManagerOptions {
  /** Maximum idle lifetime for each retained process. */
  readonly idleTimeoutMs: number
  /** Confirmed browser-process close; production uses the shared Playwright cleanup helper. */
  readonly closeBrowser?: (browser: Browser) => Promise<unknown>
  /** Clears cached setup proof when an owned browser exits unexpectedly. */
  readonly onBrowserDisconnected?: (key: string, browser: Browser) => void
  /** Resets selected-candidate proof before publishing a disconnected observation. */
  readonly resetCandidate?: () => void
  /** Suppresses stale-process observations after its owner revision changes. */
  readonly isCurrentKey?: (key: string) => boolean
  /** Makes idle-expiry cleanup uncertainty terminal for the setup owner. */
  readonly onCleanupFailure?: (error: unknown) => void
}

/** Optional exact identity required before a candidate may use a retained process. */
export interface BrowserReuseIdentity {
  /** Current owner generation. */
  readonly generation: number
  /** Selected private Playwright package identity. */
  readonly driver: BrowserSetupDriver
  /** Candidate renderer identity. */
  readonly candidate: BrowserSetupCandidate
}

/** Acquires one process; every new process receives the neutral candidate probe. */
export async function acquireCandidateBrowser(options: {
  driver: BrowserSetupDriver
  candidate: BrowserSetupCandidate
  signal: AbortSignal
  deadline: number
  isActive: () => boolean
  probe: boolean
  manager?: BrowserReuseManager
  generation?: number
}): Promise<BrowserProcessLease> {
  assertCandidateAuthority(options)
  const launch = () => acquireSetupBrowser({
    driver: options.driver,
    candidate: options.candidate,
    signal: options.signal,
    deadline: options.deadline,
    isActive: options.isActive,
    probe: options.manager ? true : options.probe,
  })
  if (options.manager && options.generation !== undefined) {
    const lease = await options.manager.acquire(createBrowserReuseKey({ generation: options.generation, driver: options.driver, candidate: options.candidate }), launch)
    try {
      assertCandidateAuthority(options)
    }
    catch (error) {
      await lease.release()
      throw error
    }
    return lease
  }
  const browser = await launch()
  const close = async () => {
    await closePreviewBrowser(browser)
  }
  return { browser, release: close, discard: close }
}

/** Scopes a process to one inventory revision, driver package, and renderer. */
function createBrowserReuseKey(identity: BrowserReuseIdentity): string {
  const { driver, candidate } = identity
  return JSON.stringify([identity.generation, driver.packageName, driver.resolvedPath, driver.version, candidate.source])
}

/** Stops a cached-process wait from outliving caller cancellation or capture deadline. */
function assertCandidateAuthority(options: { signal: AbortSignal, deadline: number, isActive: () => boolean }): void {
  if (options.signal.aborted || !options.isActive()) throw new PreviewError('CANCELLED', 'Browser setup operation cancelled')
  if (options.deadline <= Date.now()) throw new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true)
}

/** Creates lazy browser pools without allowing refresh to reassign active captures. */
export function createBrowserReuseManager(options: BrowserReuseManagerOptions): BrowserReuseManager {
  let current: { key: string, pool: BrowserProcessPool } | undefined
  let pendingRetirement: Promise<void> = Promise.resolve()
  let cleanupFailure: unknown
  let closing: Promise<void> | undefined

  /** Retains cleanup uncertainty before any later generation can acquire. */
  function retainCleanupFailure(error: unknown): void {
    cleanupFailure ??= error
    try {
      options.onCleanupFailure?.(error)
    }
    catch {
      // Observer failures cannot replace the process cleanup result.
    }
  }

  /** Moves one pool out of service and tracks confirmed idle cleanup. */
  function retireCurrent(): void {
    const retired = current
    current = undefined
    if (!retired) return
    const retirement = retired.pool.retire()
    const work = Promise.all([pendingRetirement.catch(() => {}), retirement]).then(() => {})
    pendingRetirement = work
    void work.catch(retainCleanupFailure)
  }

  /** Rejects all future reuse after owner closure or uncertain process cleanup. */
  function assertUsable(): void {
    if (cleanupFailure) throw cleanupFailure
    if (closing) throw new Error('Browser reuse manager is closed')
  }

  return {
    async acquire(key, launch) {
      assertUsable()
      if (current && current.key !== key) retireCurrent()
      await pendingRetirement
      assertUsable()
      if (!current) {
        const pool = createBrowserProcessPool({
          idleTimeoutMs: options.idleTimeoutMs,
          closeBrowser: options.closeBrowser,
          onBrowserDisconnected: (browser) => {
            if (options.isCurrentKey?.(key) ?? true) {
              options.resetCandidate?.()
              options.onBrowserDisconnected?.(key, browser)
            }
          },
          onCleanupFailure: retainCleanupFailure,
        })
        current = { key, pool }
      }
      return current.pool.acquire(launch)
    },
    invalidate() {
      if (!closing && !cleanupFailure) retireCurrent()
    },
    close() {
      if (closing) return closing
      const owned = current
      current = undefined
      closing = (async () => {
        if (owned) await owned.pool.close()
        await pendingRetirement
        if (cleanupFailure) throw cleanupFailure
      })()
      return closing
    },
  }
}

/** Releases an acquired handle if cancellation or deadline wins before owner handoff. */
export async function assertAcquiredCandidateAuthority(options: {
  lease: BrowserProcessLease
  signal: AbortSignal
  deadline: number
  isActive: () => boolean
}): Promise<void> {
  try {
    assertCandidateAuthority(options)
  }
  catch (error) {
    await options.lease.release()
    throw error
  }
}
