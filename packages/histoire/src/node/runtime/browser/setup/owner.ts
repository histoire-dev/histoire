import type { ScreenshotSetupAttempt, ScreenshotSetupReason, ScreenshotSetupSnapshot } from '@histoire/shared'
import type { BrowserSetupCandidate, BrowserSetupDriver, BrowserSetupDriverDiscovery, BrowserSetupPolicy, CaptureBrowserLease, ScreenshotSetupOwner } from './types.js'
import { hasUnconfirmedCleanup } from '../../cleanup.js'
import { ExecutionError } from '../../execution-types.js'
import { PreviewError } from '../errors.js'
import { assertSetupAuthority, awaitSetupWork } from './authority.js'
import { discoverBrowserCandidates } from './candidates.js'
import { resolveBrowserSetupDriver } from './driver.js'
import { createCaptureBrowserLease } from './lease.js'
import { browserSetupErrorFromSnapshot, changedDuringAcquisition, createBrowserSetupDiscoveryAttempt, createBrowserSetupFailureAttempt, createBrowserSetupPreviewError, getBrowserSetupRepairs, isTerminalBrowserSetupOperation, selectBrowserSetupFailureReason } from './report.js'
import { acquireCandidateBrowser, assertAcquiredCandidateAuthority, createBrowserReuseManager } from './reuse.js'
import { addSetupAttempt, copySetupAttempts, detachSetupSnapshot, initialSetupSnapshot } from './snapshot.js'

/** Creates a generation-scoped owner for discovery, probing, and browser leases. */
export function createScreenshotSetupOwner(options: {
  /** Real project root used for optional driver resolution. */
  root: string
  /** Normalized trusted source policy. */
  policy: BrowserSetupPolicy
  /** Captured generation authority; false prevents discovery and publication. */
  isActive?: () => boolean
}): ScreenshotSetupOwner {
  const isGenerationActive = options.isActive ?? (() => true)
  const listeners = new Set<(value: ScreenshotSetupSnapshot) => void>()
  let snapshot = initialSetupSnapshot()
  let driver: BrowserSetupDriver | undefined
  let candidates: BrowserSetupCandidate[] | undefined
  let discoveryGeneration = -1
  let discoveryPromise: Promise<ScreenshotSetupSnapshot> | undefined
  let generation = 0
  let selectedIndex: number | undefined
  let activeAcquire: Promise<CaptureBrowserLease> | undefined
  let activeRelease: (() => Promise<void>) | undefined
  let cleanupFailure: unknown
  let closing: Promise<void> | undefined
  let closed = false
  const reuseManager = options.policy.reuse === true
    ? createBrowserReuseManager({
        idleTimeoutMs: options.policy.idleTimeoutMs ?? 30_000,
        isCurrentKey: key => key.startsWith(`[${generation},`),
        resetCandidate: () => { selectedIndex = undefined },
        onBrowserDisconnected: () => publish({ state: 'unverified', attempts: [], repairs: [] }),
        onCleanupFailure: error => retainCleanupFailure(error),
      })
    : undefined

  /** Returns whether this owner still represents a live runtime generation. */
  function active(): boolean {
    try {
      return !closed && isGenerationActive()
    }
    catch {
      return false
    }
  }

  /** Rejects asynchronous discovery results after generation invalidation. */
  function isCurrent(captured: number): boolean {
    return active() && generation === captured
  }

  /** Publishes one detached revision without letting observers affect ownership. */
  function publish(next: Omit<ScreenshotSetupSnapshot, 'revision'>): ScreenshotSetupSnapshot {
    if (!active()) return detachSetupSnapshot(snapshot)
    snapshot = { revision: snapshot.revision + 1, ...next }
    const detached = detachSetupSnapshot(snapshot)
    for (const listener of listeners) {
      try {
        listener(detachSetupSnapshot(detached))
      }
      catch {
        /* Setup observers cannot alter browser cleanup or acquisition. */
      }
    }
    return detached
  }

  /** Publishes only for the captured generation; old work cannot overwrite refresh. */
  function publishCurrent(captured: number, next: Omit<ScreenshotSetupSnapshot, 'revision'>): void {
    if (isCurrent(captured)) publish(next)
  }

  /** Builds a safe classified error only while its discovery revision remains current. */
  function failSetup(reason: ScreenshotSetupReason, attempts: ScreenshotSetupAttempt[], selected: BrowserSetupDriver | undefined, captured: number): PreviewError {
    if (!isCurrent(captured)) return changedDuringAcquisition()
    const setup = publish({
      state: 'needs-action',
      reason,
      attempts: copySetupAttempts(attempts),
      repairs: getBrowserSetupRepairs(reason, options.policy, selected?.packageName, process.platform, selected?.version),
    })
    return createBrowserSetupPreviewError(reason, setup)
  }

  /** Resolves metadata once per invalidation revision and never launches. */
  async function discover(): Promise<ScreenshotSetupSnapshot> {
    assertOwnerUsable()
    if (!active()) return detachSetupSnapshot(snapshot)
    if (discoveryGeneration === generation) return detachSetupSnapshot(snapshot)
    if (discoveryPromise) return detachSetupSnapshot(await discoveryPromise)
    const captured = generation
    publishCurrent(captured, { state: 'checking', attempts: [], repairs: [] })
    const work = (async () => {
      let result: BrowserSetupDriverDiscovery
      try {
        result = await resolveBrowserSetupDriver(options.root)
      }
      catch {
        if (!isCurrent(captured)) return detachSetupSnapshot(snapshot)
        discoveryGeneration = captured
        return failSetup('startup-failed', [], undefined, captured).setup ?? detachSetupSnapshot(snapshot)
      }
      if (!isCurrent(captured)) return detachSetupSnapshot(snapshot)
      if (result.status === 'missing' || result.status === 'invalid') {
        discoveryGeneration = captured
        return failSetup(result.reason, [], undefined, captured).setup!
      }
      let candidatesForGeneration: BrowserSetupCandidate[]
      try {
        candidatesForGeneration = await discoverBrowserCandidates(options.policy, result.driver)
      }
      catch {
        if (!isCurrent(captured)) return detachSetupSnapshot(snapshot)
        discoveryGeneration = captured
        return failSetup('startup-failed', [], result.driver, captured).setup!
      }
      if (!isCurrent(captured)) return detachSetupSnapshot(snapshot)
      driver = result.driver
      candidates = candidatesForGeneration
      if (!candidatesForGeneration.some(candidate => candidate.presence !== 'absent')) {
        const attempts = candidatesForGeneration.map(candidate => createBrowserSetupDiscoveryAttempt(candidate.source, candidate.unavailableReason ?? 'browser-missing', result.driver))
        discoveryGeneration = captured
        return failSetup(selectBrowserSetupFailureReason(attempts), attempts, result.driver, captured).setup!
      }
      discoveryGeneration = captured
      return publish({ state: 'unverified', attempts: [], repairs: [] })
    })()
    discoveryPromise = work
    try {
      return detachSetupSnapshot(await work)
    }
    finally {
      if (discoveryPromise === work) discoveryPromise = undefined
    }
  }

  /** Attempts one frozen finite inventory; invalidation never cancels an active capture. */
  async function acquire(signal: AbortSignal, deadline: number): Promise<CaptureBrowserLease> {
    assertOwnerUsable()
    assertSetupAuthority(signal, deadline, active)
    if (activeAcquire || activeRelease) throw new PreviewError('BROWSER_UNAVAILABLE', 'Screenshot browser is already in use', true)
    const work = acquireOwned(signal, deadline)
    activeAcquire = work
    try {
      return await work
    }
    finally {
      if (activeAcquire === work) activeAcquire = undefined
    }
  }

  /** Acquires from a copied candidate list so refresh cannot erase active metadata. */
  async function acquireOwned(signal: AbortSignal, deadline: number): Promise<CaptureBrowserLease> {
    let captured: number
    let inventory: ScreenshotSetupSnapshot
    do {
      captured = generation
      try {
        inventory = await awaitSetupWork(discover(), signal, deadline, active)
        assertSetupAuthority(signal, deadline, active)
      }
      catch (error) {
        if (isTerminalBrowserSetupOperation(error, signal, deadline)) resetCurrentSnapshot(captured)
        throw error
      }
    } while (captured !== generation)
    if (inventory.state === 'needs-action' && inventory.reason) throw browserSetupErrorFromSnapshot(inventory)
    const selectedDriver = driver
    const inventoryCandidates = candidates?.slice() ?? []
    if (!selectedDriver || !inventoryCandidates.length) throw failSetup('browser-missing', [], selectedDriver, captured)

    const attempts: ScreenshotSetupAttempt[] = []
    const cachedIndex = selectedIndex
    const startAt = cachedIndex ?? 0
    publishCurrent(captured, { state: 'checking', attempts: [], repairs: [] })
    for (let index = startAt; index < inventoryCandidates.length; index++) {
      assertSetupAuthority(signal, deadline, active)
      const candidate = inventoryCandidates[index]
      if (candidate.presence === 'absent' || candidate.unavailableReason) {
        addSetupAttempt(attempts, createBrowserSetupDiscoveryAttempt(candidate.source, candidate.unavailableReason ?? 'browser-missing', selectedDriver))
        publishCurrent(captured, { state: 'checking', attempts: copySetupAttempts(attempts), repairs: [] })
        continue
      }
      try {
        const processLease = await acquireCandidateBrowser({ driver: selectedDriver, candidate, signal, deadline, isActive: active, probe: index !== cachedIndex, manager: reuseManager, generation: captured })
        await assertAcquiredCandidateAuthority({ lease: processLease, signal, deadline, isActive: active })
        const lease = createCaptureBrowserLease({
          browser: processLease.browser,
          source: candidate.source,
          releaseBrowser: processLease.release,
          discardBrowser: processLease.discard,
          retainCleanupFailure,
          onReleased: (released) => {
            if (activeRelease === released) activeRelease = undefined
          },
        })
        activeRelease = lease.release
        if (isCurrent(captured)) {
          selectedIndex = index
          publish({ state: 'ready', source: candidate.source, attempts: copySetupAttempts(attempts), repairs: [] })
        }
        if (!active()) {
          await lease.release()
          throw new PreviewError('CANCELLED', 'Browser setup operation cancelled')
        }
        return lease
      }
      catch (error) {
        if (hasUnconfirmedCleanup(error)) {
          retainCleanupFailure(error)
          resetCurrentSnapshot(captured)
          throw error
        }
        if (isTerminalBrowserSetupOperation(error, signal, deadline)) {
          resetCurrentSnapshot(captured)
          throw error
        }
        const failure = createBrowserSetupFailureAttempt(candidate.source, error, selectedDriver)
        addSetupAttempt(attempts, failure.attempt)
        if (!failure.continueCandidates) throw failSetup(failure.attempt.reason, attempts, selectedDriver, captured)
        if (isCurrent(captured) && index === cachedIndex) selectedIndex = undefined
        publishCurrent(captured, { state: 'checking', attempts: copySetupAttempts(attempts), repairs: [] })
      }
    }
    const reason = selectBrowserSetupFailureReason(attempts)
    throw failSetup(reason, attempts, selectedDriver, captured)
  }

  /** Marks owner terminal before joining active acquisition and exact lease cleanup. */
  function close(): Promise<void> {
    if (closing) return closing
    closed = true
    generation++
    closing = (async () => {
      await activeAcquire?.catch(() => {})
      try {
        await activeRelease?.()
      }
      catch {
        /* The retained cleanup error is reported below. */
      }
      await reuseManager?.close().catch(error => retainCleanupFailure(error))
      if (cleanupFailure) throw cleanupFailure
    })()
    return closing
  }

  /** Rejects work after terminal resource cleanup or closed owner. */
  function assertOwnerUsable(): void {
    if (cleanupFailure) throw cleanupFailure
    if (closed) throw new PreviewError('CANCELLED', 'Browser setup owner is closed')
  }

  /** Retains the exact unsafe cleanup result for every later owner operation. */
  function retainCleanupFailure(error: unknown): unknown {
    cleanupFailure ??= hasUnconfirmedCleanup(error)
      ? error
      : new ExecutionError('CLEANUP_UNCONFIRMED', 'Screenshot browser cleanup could not be confirmed', error)
    return cleanupFailure
  }

  /** Clears transient checking state only when this acquisition still owns revision. */
  function resetCurrentSnapshot(captured: number): void {
    publishCurrent(captured, { state: 'unverified', attempts: [], repairs: [] })
  }
  return {
    discover,
    acquire,
    /** Invalidation clears metadata and proof without interrupting an owned story capture. */
    invalidate() {
      if (!active() || cleanupFailure) return
      reuseManager?.invalidate()
      generation++
      driver = undefined
      candidates = undefined
      discoveryGeneration = -1
      discoveryPromise = undefined
      selectedIndex = undefined
      publish({ state: 'unverified', attempts: [], repairs: [] })
    },
    /** Returns detached observation, including after terminal close. */
    getSnapshot: () => detachSetupSnapshot(snapshot),
    /** Subscribers cannot mutate owner state or browser cleanup. */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close,
  }
}
