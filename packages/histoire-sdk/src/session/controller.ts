import type { HistoireSearchResult, HistoireSnapshot, HistoireTarget } from '@histoire/protocol'
import type { HistoireSessionAdapters, HistoireSourceConnection } from '../adapters/types.js'
import type { HistoireSession, HistoireSessionOptions } from '../types.js'
import { HistoireSdkError, validateHistoireSourceDescriptor, validateSettingsPatch } from '@histoire/protocol'
import { createSessionChannels } from './channels.js'
import { SessionContext } from './context.js'
import { clearEvents } from './events.js'
import { bindHistoireSessionInternals } from './internal.js'
import { mountSurface } from './mounts.js'
import { receiveNotification } from './notifications.js'
import { observeOperation } from './ownership.js'
import { request } from './request.js'
import { reconcileSelection, resolveSelection, select } from './selection.js'
import { collectTests, getDocs, getSource, runTests } from './services.js'
import { updateSettings } from './settings.js'
import { getState, patchState, resetState } from './state.js'

/** Exact accepted intent, reserved before synchronous selection observers run. */
interface PendingSelection {
  /** Normalized target, including remembered/default variants. */
  target: HistoireTarget
  /** Generation after this intent's synchronous publication. */
  version: number
  /** Source publication and connection captured at admission. */
  source: NonNullable<HistoireSnapshot['source']>
  /** Reconnection cannot inherit an earlier intent with the same IDs. */
  connection: HistoireSourceConnection
  /** Optional primary attachment; no implicit preview reservation. */
  mountId: string | null
  /** All matching callers share original acknowledgment and failure. */
  promise: Promise<void>
}

/** Create isolated controller over first-party adapters; no DOM on construction. */
export function createHistoireSessionWithAdapters(options: HistoireSessionOptions, adapters: HistoireSessionAdapters): HistoireSession {
  const context = new SessionContext(options, adapters)
  let connecting: Promise<void> | null = null
  let disposing: Promise<void> | null = null
  let selected = Promise.resolve()
  let pendingSelection: PendingSelection | null = null
  const closed = new WeakSet<HistoireSourceConnection>()

  /** Close each acquired source exactly once, including late acquisition. */
  const closeSource = async (connection: HistoireSourceConnection) => {
    if (closed.has(connection)) return
    closed.add(connection)
    await connection.close()
  }

  /** Explicit connection shares in-flight work and never executes stories. */
  const connect = (): Promise<void> => {
    try {
      context.assertActive()
    }
    catch (error) {
      return observeOperation(Promise.reject<void>(error))
    }
    if (connecting) return connecting
    if (context.snapshot.status === 'ready') return Promise.resolve()
    const previous = context.connection
    connecting = context.operations.run({ kind: 'connect' }, async (signal) => {
      // Keep predecessor attached until owned task starts. Reentrant disposal
      // during connecting publication must still be able to close that source.
      context.unsubscribeSource?.()
      context.unsubscribeSource = null
      context.connection = null
      signal.throwIfAborted()
      await Promise.all([...context.mounts.values()].map(mount => mount.handle.unmount()))
      if (previous) await closeSource(previous)
      if (signal.aborted) throw signal.reason
      const connection = await context.adapters.connect({ url: context.url, sessionId: context.sessionId, signal })
      if (signal.aborted || context.snapshot.status === 'disposed') {
        await closeSource(connection)
        throw signal.reason ?? new HistoireSdkError('DISPOSED', 'Session disposed during connection.')
      }
      try {
        if (connection.descriptor.protocolVersion !== 1 || connection.descriptor.descriptorVersion !== 1) throw new HistoireSdkError('PROTOCOL_MISMATCH', 'Unsupported source descriptor version.')
        validateHistoireSourceDescriptor(connection.descriptor)
        context.connection = connection
        context.descriptor = context.copy(connection.descriptor)
        context.engine = context.copy(connection.descriptor.capabilities)
        const catalog = context.copy(connection.descriptor.catalog)
        const saved = context.persistence.read()
        const settings = context.copy({ ...context.snapshot.settings, ...validateSettingsPatch(connection.initialSettings ?? {}), ...saved, ...context.explicitSettings })
        const selected = reconcileSelection(context, catalog)
        context.unsubscribeSource = connection.subscribe(notification => receiveNotification(context, notification))
        context.publish({
          status: 'ready',
          stale: false,
          source: context.copy({ sourceId: connection.descriptor.sourceId, url: context.url, mode: connection.descriptor.mode, epoch: connection.descriptor.epoch, revision: connection.descriptor.revision }),
          catalog,
          diagnostics: catalog.diagnostics,
          selection: context.copy(selected),
          settings,
          state: null,
        })
      }
      catch (error) {
        context.connection = null
        await closeSource(connection)
        throw error
      }
    }, () => context.assertActive())
    const current = connecting
    void current.then(
      () => { if (connecting === current) connecting = null },
      () => {
        if (connecting === current) connecting = null
        if (context.snapshot.status !== 'disposed') context.publish({ status: 'failed', stale: context.snapshot.source !== null })
      },
    )
    // Reserve shared operation before observers can synchronously call connect.
    context.publish({ status: 'connecting' })
    return current
  }

  /** Terminal invalidation happens synchronously before owned-resource awaits. */
  const dispose = (): Promise<void> => {
    if (disposing) return disposing
    context.selectionVersion++
    context.runtimeVersion++
    context.publish({ status: 'disposed', stale: context.snapshot.source !== null })
    context.operations.reject('DISPOSED', 'Session disposed.')
    context.unsubscribeSource?.()
    context.unsubscribeSource = null
    context.listeners.clear()
    context.eventListeners.clear()
    const connection = context.connection
    context.connection = null
    disposing = Promise.allSettled([...context.mounts.values()].map(mount => mount.handle.unmount()).concat(connection ? [closeSource(connection)] : [])).then((results) => {
      const failure = results.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    })
    void disposing.catch(() => {})
    return disposing
  }

  const session: HistoireSession = {
    connect,
    dispose,
    getSnapshot: () => context.snapshot,
    subscribe: (listener) => {
      context.assertActive()
      context.listeners.add(listener)
      return () => context.listeners.delete(listener)
    },
    catalog: {
      list: () => observeOperation((async () => {
        context.assertCapability('catalog')
        return context.snapshot.catalog.stories
      })()),
      getStory: storyId => observeOperation((async () => {
        context.assertCapability('catalog')
        return context.story(storyId)
      })()),
      search: query => observeOperation((async () => {
        context.assertCapability('search')
        if (typeof query !== 'string') throw new HistoireSdkError('INVALID_ARGUMENT', 'Search query must be a string.')
        return context.copy(await request<readonly HistoireSearchResult[]>(context, context.assertConnected(), 'catalog.search', { query }))
      })()),
    },
    selection: { select: (input) => {
      let target: HistoireTarget
      try {
        target = resolveSelection(context, input)
      }
      catch (error) {
        return observeOperation(Promise.reject<void>(error))
      }
      const source = context.snapshot.source!
      const pending = pendingSelection
      if (pending && pending.version === context.selectionVersion && pending.connection === context.connection
        && pending.source.epoch === source.epoch && pending.source.revision === source.revision
        && pending.mountId === context.primaryId && (!pending.mountId || context.mounts.get(pending.mountId)?.active)
        && pending.target.storyId === target.storyId && pending.target.variantId === target.variantId) {
        return pending.promise
      }
      let resolve!: () => void
      let reject!: (error: unknown) => void
      const promise = observeOperation(new Promise<void>((complete, fail) => {
        resolve = complete
        reject = fail
      }))
      const previous = context.snapshot.selection
      const changed = previous?.storyId !== target.storyId || previous.variantId !== target.variantId
      const intent: PendingSelection = { target, version: context.selectionVersion + Number(changed), source, connection: context.connection!, mountId: context.primaryId, promise }
      // Reserve ACK and composition barrier before publication. Reentrant or
      // later matching intent cannot replace this barrier with an early no-op.
      pendingSelection = intent
      selected = promise.then(() => {}, () => {})
      void select(context, target).then(() => {
        if (pendingSelection === intent) pendingSelection = null
        resolve()
      }, (error) => {
        if (pendingSelection === intent) pendingSelection = null
        reject(error)
      })
      return promise
    } },
    state: { get: () => observeOperation(getState(context)), patch: patch => observeOperation(patchState(context, patch)), reset: () => observeOperation(resetState(context)) },
    settings: { update: patch => observeOperation(updateSettings(context, patch)) },
    events: {
      subscribe: (listener) => {
        context.assertActive()
        context.eventListeners.add(listener)
        return () => context.eventListeners.delete(listener)
      },
      clear: () => clearEvents(context),
    },
    channels: createSessionChannels(context),
    docs: { get: storyId => observeOperation(getDocs(context, storyId)) },
    source: { get: input => observeOperation(getSource(context, input)) },
    tests: { collect: () => observeOperation(collectTests(context)), run: options => observeOperation(runTests(context, options)) },
    mount: (container, options) => mountSurface(context, container, options.surface),
    createHiddenPreview: () => mountSurface(context, undefined, 'preview', true),
  }
  context.session = session
  bindHistoireSessionInternals(session, context, () => selected)
  return session
}
