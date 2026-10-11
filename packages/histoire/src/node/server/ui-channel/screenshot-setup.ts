import type { Context } from '../../context.js'
import type { ScreenshotSetupOwner } from '../../runtime/browser/setup/types.js'
import type { ExecutionService } from '../../runtime/execution-service.js'
import type { ExecutionHandle } from '../../runtime/execution-types.js'
import type { UiClientConnection } from './client-connection.js'
import type { UiChannelClient, UiChannelServer } from './types.js'
import { PreviewError } from '../../runtime/browser/errors.js'
import { classifyBrowserSetupFailure } from '../../runtime/browser/setup/report.js'
import { drainExecutionHandles } from '../../runtime/execution-owner.js'
import { ExecutionError } from '../../runtime/execution-types.js'
import { getContextScreenshotSetup } from '../../runtime/registry.js'
import { observeUiClientConnection } from './client-connection.js'
import {
  isScreenshotSetupResultWithinBudget,
  portableScreenshotSetupSnapshot,
  screenshotSetupCancelSchema,
  screenshotSetupRequestSchema,
} from './screenshot-setup-validation.js'

const setupResultEvent = 'histoire:ui:screenshot-setup-result'
const setupDeadlineMs = 15_000
const setupResultLimitError = { code: 'invalid', message: 'Screenshot setup result exceeds the 8 KB channel limit' } as const

/** One explicit setup request, owned by the exact originating socket. */
interface SetupRequest {
  /** Client object is the cancellation authority. */
  client: UiChannelClient
  /** Browser correlation identity. */
  requestId: string
  /** Only explicit checks own cancellable lane work. */
  action: 'read' | 'check' | 'refresh'
  /** A check's exact lane job; reads never acquire this handle. */
  handle?: ExecutionHandle<unknown>
  /** Prevent refresh/read work from publishing after channel shutdown. */
  cancelled: boolean
  /** Listener scope follows only this socket request. */
  connection?: UiClientConnection
}

/** Map infrastructure errors to fixed public setup-channel messages. */
function setupError(error: unknown) {
  if (error instanceof ExecutionError && error.code === 'CANCELLED') return { code: 'cancelled' as const, message: 'Screenshot setup check cancelled' }
  if (error instanceof ExecutionError && error.code === 'QUEUE_FULL') return { code: 'unavailable' as const, message: 'Screenshot setup check queue is full' }
  return { code: 'unavailable' as const, message: 'Screenshot setup check is unavailable' }
}

/** Read one owner-attached failure snapshot or a current snapshot for audited launch errors. */
function setupFailureSnapshot(error: unknown, owner: ScreenshotSetupOwner): ReturnType<ScreenshotSetupOwner['getSnapshot']> | undefined {
  if (error instanceof PreviewError) {
    const setup = error.setup
    if (setup?.state === 'needs-action') {
      try {
        return portableScreenshotSetupSnapshot(setup)
      }
      catch { /* Only a valid portable setup DTO can cross the channel. */ }
    }
  }
  if (!classifyBrowserSetupFailure(error)) return undefined
  const current = owner.getSnapshot()
  return current.state === 'needs-action' ? portableScreenshotSetupSnapshot(current) : undefined
}

/** Send a compact correlated result or a fixed error when a DTO exceeds budget. */
function sendSetupResult(channel: UiChannelServer, client: UiChannelClient, result: { requestId: string, setup: ReturnType<ScreenshotSetupOwner['getSnapshot']> } | { requestId: string, error: { code: string, message: string } }) {
  if (client.socket.readyState !== 1) return
  if (!isScreenshotSetupResultWithinBudget(result)) result = { requestId: result.requestId, error: setupResultLimitError }
  channel.send(setupResultEvent, result, client)
}

/** Read metadata, optionally submit one explicit probe, and scope cancellation to its client. */
export function registerScreenshotSetupChannel(ctx: Context, channel: UiChannelServer, execution: ExecutionService, isActive: () => boolean): void {
  const requests = new Set<SetupRequest>()
  const connections = new Set<UiClientConnection>()
  let closed = false

  /** Prevent one socket from reusing its own in-flight correlation ID. */
  function findRequest(client: UiChannelClient, requestId: string): SetupRequest | undefined {
    return [...requests].find(request => request.client === client && request.requestId === requestId)
  }

  /** Reads can discover installed metadata, but never launch or download a browser. */
  async function readSnapshot(owner: ScreenshotSetupOwner, action: 'read' | 'refresh') {
    if (action === 'refresh') owner.invalidate()
    return portableScreenshotSetupSnapshot(await owner.discover())
  }

  /** Emit only while this request and captured server generation remain live. */
  function sendIfOwned(request: SetupRequest, result: Parameters<typeof sendSetupResult>[2]): void {
    if (!closed && !request.cancelled && isActive() && request.connection?.isOpen()) sendSetupResult(channel, request.client, result)
  }

  /** Process one correlated setup action on the current generation. */
  async function handleAction(value: ReturnType<typeof screenshotSetupRequestSchema.parse>, client: UiChannelClient): Promise<void> {
    const request: SetupRequest = { client, requestId: value.requestId, action: value.action, cancelled: false }
    if (findRequest(client, request.requestId)) {
      sendSetupResult(channel, client, { requestId: request.requestId, error: { code: 'invalid', message: 'Screenshot setup request already exists' } })
      return
    }
    requests.add(request)
    const connection = observeUiClientConnection(client, () => {
      request.cancelled = true
      request.handle?.cancel()
    })
    request.connection = connection
    connections.add(connection)
    if (!connection.isOpen()) {
      requests.delete(request)
      connections.delete(connection)
      connection.dispose()
      return
    }
    let owner: ScreenshotSetupOwner | undefined
    try {
      owner = getContextScreenshotSetup(ctx, isActive)
      if (value.action !== 'check') {
        const setup = await readSnapshot(owner, value.action)
        sendIfOwned(request, { requestId: request.requestId, setup })
        return
      }

      const handle = execution.enqueue({
        validate: () => {
          if (closed || request.cancelled || !isActive()) throw new ExecutionError('UNAVAILABLE', 'Screenshot setup generation retired')
        },
        run: async (signal) => {
          const lease = await owner.acquire(signal, Date.now() + setupDeadlineMs)
          try {
            return portableScreenshotSetupSnapshot(owner.getSnapshot())
          }
          finally {
            await lease.release()
          }
        },
      })
      request.handle = handle
      try {
        const setup = await handle.result
        sendIfOwned(request, { requestId: request.requestId, setup })
      }
      catch (error) {
        const setup = setupFailureSnapshot(error, owner)
        if (setup) {
          sendIfOwned(request, { requestId: request.requestId, setup })
        }
        else {
          sendIfOwned(request, { requestId: request.requestId, error: setupError(error) })
        }
      }
    }
    catch (error) {
      if (owner && value.action === 'check') {
        const setup = setupFailureSnapshot(error, owner)
        if (setup) {
          sendIfOwned(request, { requestId: request.requestId, setup })
        }
        else {
          sendIfOwned(request, { requestId: request.requestId, error: setupError(error) })
        }
      }
      else {
        sendIfOwned(request, { requestId: request.requestId, error: setupError(error) })
      }
    }
    finally {
      requests.delete(request)
      connections.delete(connection)
      connection.dispose()
    }
  }

  channel.on('histoire:ui:screenshot-setup', value => screenshotSetupRequestSchema.parse(value), handleAction)
  channel.on('histoire:ui:screenshot-setup-cancel', value => screenshotSetupCancelSchema.parse(value), ({ requestId }, client) => {
    const request = findRequest(client, requestId)
    if (!request || request.action !== 'check') return
    request.cancelled = true
    request.handle?.cancel()
  })

  channel.addCleanup(async () => {
    closed = true
    const active = [...requests]
    for (const request of active) {
      request.cancelled = true
      request.handle?.cancel()
    }
    for (const connection of connections) connection.dispose()
    connections.clear()
    await drainExecutionHandles(execution, active.flatMap(request => request.handle ? [request.handle] : []))
  })
}
