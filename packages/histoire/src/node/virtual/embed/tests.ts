import type { HistoireSourceDescriptor } from '@histoire/protocol'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '../../context.js'
import { HistoireSdkError, validateHistoireTarget, validateWireValue } from '@histoire/protocol'
import { awaitSdkExecution } from '../../api/execution.js'
import { getRuntimeCatalogForContext } from '../../runtime/catalog/attachment.js'
import { lookupTarget } from '../../runtime/catalog/lookup.js'
import { getContextRegistry } from '../../runtime/registry.js'
import { createHistoireTestTask } from '../../test/execution-service.js'
import { readEmbedActionInput } from './request.js'

/** Source wrapper submits exact captured dev target through canonical project lane. */
export async function runEmbedServerTests(ctx: Context, request: IncomingMessage, response: ServerResponse, descriptor: HistoireSourceDescriptor) {
  const input = await readEmbedActionInput(request) as any
  validateWireValue(input, { kind: 'request', name: 'tests.run' })
  if (!input || Object.keys(input).some(key => !['epoch', 'revision', 'target'].includes(key))) throw new HistoireSdkError('INVALID_ARGUMENT', 'Invalid test request fields')
  validateHistoireTarget(input.target)
  if (!input.target.variantId) throw new HistoireSdkError('VARIANT_NOT_FOUND', 'Tests require selected variant')
  const owner = getContextRegistry(ctx).execution
  const catalog = getRuntimeCatalogForContext(ctx)?.catalog
  const snapshot = catalog?.current
  if (!descriptor.capabilities.serverTests.available || !owner?.isActive() || !snapshot) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Server test engine unavailable')
  if (descriptor.epoch !== input.epoch || descriptor.revision !== input.revision) throw new HistoireSdkError('STALE_REVISION', 'Test source publication changed')
  lookupTarget(snapshot, input.target.storyId, input.target.variantId)
  const task = createHistoireTestTask(ctx, input.target)
  const handle = owner.service.enqueue({ ...task, validate() {
    task.validate?.()
    if (!owner.isActive() || catalog.current !== snapshot) throw new HistoireSdkError('RUNTIME_CHANGED', 'Test source owner changed')
  } })
  /** HTTP abort retires caller; scheduler retains cleanup ownership. */
  const closed = () => {
    if (!response.writableEnded) handle.cancel()
  }
  response.once('close', closed)
  try {
    const summary = await awaitSdkExecution(handle)
    if (!owner.isActive() || catalog.current !== snapshot) throw new HistoireSdkError('RUNTIME_CHANGED', 'Test source owner changed')
    return summary
  }
  finally { response.off('close', closed) }
}
