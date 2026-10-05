import type { HistoireRequestCapture, HistoireSessionCommand, HistoireTransport } from '../adapters/types.js'
import type { SessionContext } from './context.js'
import type { OperationScope } from './ownership.js'
import { HistoireSdkError, validateBridgeResult, validateWireValue } from '@histoire/protocol'

/** Send one captured request; stale success never mutates replacement lifetime. */
export function request<T>(context: SessionContext, transport: HistoireTransport, command: HistoireSessionCommand, payload: unknown, scope: OperationScope = { kind: 'source' }, signal?: AbortSignal): Promise<T> {
  const connection = context.assertConnected()
  const source = context.snapshot.source!
  const selectionVersion = context.selectionVersion
  const runtimeVersion = context.runtimeVersion
  const target = context.snapshot.selection
  const identity = {
    sessionId: context.sessionId,
    connectionId: transport.id,
    sourceId: source.sourceId,
    epoch: source.epoch,
    revision: source.revision,
    ...(scope.mountId ? { mountId: scope.mountId } : {}),
    ...(scope.kind === 'runtime' && context.snapshot.runtime.runtimeId ? { runtimeId: context.snapshot.runtime.runtimeId } : {}),
    ...(target ? { target } : {}),
  }
  validateWireValue(payload, { kind: 'request', name: command })
  const guard = () => {
    context.assertConnected()
    if (context.connection !== connection || context.snapshot.source?.epoch !== source.epoch || context.snapshot.source?.revision !== source.revision) {
      throw new HistoireSdkError('STALE_REVISION', 'Source changed during operation.')
    }
    if (scope.mountId && !context.mounts.get(scope.mountId)?.active) throw new HistoireSdkError('RUNTIME_CHANGED', 'Surface detached during operation.')
    if ((scope.kind === 'runtime' || scope.kind === 'selection') && selectionVersion !== context.selectionVersion) throw new HistoireSdkError('RUNTIME_CHANGED', 'Selected target changed during operation.')
    if (scope.kind === 'runtime' && runtimeVersion !== context.runtimeVersion) throw new HistoireSdkError('RUNTIME_CHANGED', 'Runtime document changed during operation.')
  }
  return context.operations.run(scope, async (ownedSignal) => {
    const result = await transport.request<T>(command, payload, { ...identity, signal: ownedSignal } as HistoireRequestCapture)
    if (result !== undefined) validateWireValue(result, { kind: 'response', name: command })
    if (!['selection.select', 'settings.update', 'events.clear'].includes(command) && !(result === undefined && ['state.patch', 'state.reset'].includes(command))) {
      validateBridgeResult(command, result)
    }
    if (command === 'docs.get' || command === 'source.get') {
      const content = result as { epoch: string, revision: string, storyId: string }
      if (content.epoch !== source.epoch || content.revision !== source.revision) throw new HistoireSdkError('STALE_REVISION', 'Content reply belongs to another source publication.')
      if (content.storyId !== (payload as { storyId: string }).storyId) throw new HistoireSdkError('INVALID_ARGUMENT', 'Content reply does not match requested story.')
    }
    if (command === 'tests.collect' || command === 'tests.run') {
      const execution = (result as { execution?: import('@histoire/protocol').HistoireTestExecutionIdentity }).execution
      const mode = command === 'tests.collect' ? 'preview' : (payload as { mode: string }).mode
      if (execution && (execution.mode !== mode || execution.sourceId !== source.sourceId || execution.epoch !== source.epoch || execution.revision !== source.revision || execution.target?.storyId !== target?.storyId || execution.target?.variantId !== target?.variantId || (mode === 'preview' && execution.runtimeId !== identity.runtimeId))) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test result belongs to another execution owner.')
    }
    return result
  }, guard, signal)
}

/** Await actual selected-runtime readiness, cleaning waiters on every outcome. */
export function waitForRuntime(context: SessionContext, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function cleanup() {
      context.listeners.delete(check)
      signal.removeEventListener('abort', onAbort)
      clearTimeout(timer)
    }
    function onAbort() {
      cleanup()
      reject(signal.reason ?? new HistoireSdkError('CANCELLED', 'Readiness cancelled.'))
    }
    function check() {
      if (context.snapshot.runtime.status === 'ready' && context.snapshot.runtime.runtimeId) {
        cleanup()
        resolve()
      }
      else if (['failed', 'stale', 'absent'].includes(context.snapshot.runtime.status)) {
        cleanup()
        reject(new HistoireSdkError('PREVIEW_NOT_READY', 'Preview became unavailable before readiness.'))
      }
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    context.listeners.add(check)
    signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      cleanup()
      reject(new HistoireSdkError('TIMEOUT', 'Preview readiness timed out.'))
    }, context.connection?.descriptor.config?.storyCollectTimeout ?? 30_000)
    check()
  })
}
