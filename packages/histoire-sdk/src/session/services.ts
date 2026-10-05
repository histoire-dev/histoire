import type { HistoireDocsContent, HistoireSourceContent, HistoireTestCollectionResult, HistoireTestRunSummary } from '@histoire/protocol'
import type { SessionContext } from './context.js'
import { HistoireSdkError } from '@histoire/protocol'
import { request } from './request.js'
import { primaryRuntime } from './state.js'
import { assertVariant } from './variant.js'

/** Metadata-only lazy docs; no preview reservation or story execution. */
export async function getDocs(context: SessionContext, storyId: string): Promise<HistoireDocsContent> {
  context.story(storyId)
  context.assertCapability('docs')
  return context.copy(await request(context, context.assertConnected(), 'docs.get', { storyId }))
}

/** Raw source uses data bridge; dynamic source requires selected runtime. */
export async function getSource(context: SessionContext, input: { storyId: string, variantId?: string, mode: 'raw' | 'dynamic' }): Promise<HistoireSourceContent> {
  const story = context.story(input?.storyId)
  if (!['raw', 'dynamic'].includes(input.mode)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Unknown source mode.')
  if (input.variantId !== undefined) assertVariant(story, input.variantId)
  context.assertCapability(input.mode === 'raw' ? 'rawSource' : 'dynamicSource')
  const payload = { storyId: input.storyId, mode: input.mode, ...(input.variantId !== undefined ? { variantId: input.variantId } : {}) }
  if (input.mode === 'raw') return context.copy(await request(context, context.assertConnected(), 'source.get', payload))
  const selected = context.selected()
  const variantId = input.variantId ?? (selected.storyId === input.storyId ? selected.variantId : null)
  if (selected.storyId !== input.storyId || selected.variantId !== variantId) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Dynamic source requires matching selected preview.')
  const primary = primaryRuntime(context)
  return context.copy(await request(context, primary.transport, 'source.get', { ...payload, variantId }, { kind: 'runtime', mountId: primary.handle.id }))
}

/** Collection belongs to explicit selected ready preview. */
export async function collectTests(context: SessionContext): Promise<HistoireTestCollectionResult> {
  const primary = primaryRuntime(context)
  context.assertCapability('previewTests')
  return context.copy(await request(context, primary.transport, 'tests.collect', {}, { kind: 'runtime', mountId: primary.handle.id }))
}

/** One requested engine, one attributed run; assertion failure still resolves. */
export async function runTests(context: SessionContext, options: { mode: 'preview' | 'server', signal?: AbortSignal }): Promise<HistoireTestRunSummary> {
  const target = context.selected()
  if (!target.variantId) throw new HistoireSdkError('VARIANT_NOT_FOUND', 'Tests require selected variant.')
  if (!options || !['preview', 'server'].includes(options.mode)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test mode must be preview or server.')
  if (options.mode === 'server') {
    context.assertCapability('serverTests')
    if (context.snapshot.source?.mode !== 'dev') throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Static sources have no server test engine.')
    return context.copy(await request(context, context.assertConnected(), 'tests.run', { mode: options.mode }, { kind: 'selection' }, options.signal))
  }
  const primary = primaryRuntime(context)
  context.assertCapability('previewTests')
  return context.copy(await request(context, primary.transport, 'tests.run', { mode: options.mode }, { kind: 'runtime', mountId: primary.handle.id }, options.signal))
}
