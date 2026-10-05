import type { HistoireSourceDescriptor } from '@histoire/protocol'
import type { CatalogSnapshot } from '../../runtime/catalog/types.js'
import { HistoireSdkError, validateHistoireTarget, validateWireValue } from '@histoire/protocol'
import { lookupStory, lookupTarget } from '../../runtime/catalog/lookup.js'

/** Resolve registered private physical source; no arbitrary file/path/URL arguments. */
export function resolveEmbedEditorTarget(snapshot: CatalogSnapshot, descriptor: HistoireSourceDescriptor, value: unknown): string {
  if (descriptor.mode !== 'dev' || !descriptor.capabilities.openInEditor.available) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Editor is available only in dev')
  validateWireValue(value, { kind: 'request', name: 'openInEditor' })
  const input = value as { target: { storyId: string, variantId: string | null }, epoch: string, revision: string }
  if (!input || Object.keys(input).some(key => !['target', 'epoch', 'revision'].includes(key))) throw new HistoireSdkError('INVALID_ARGUMENT', 'Invalid editor request fields')
  validateHistoireTarget(input.target)
  if (input.epoch !== descriptor.epoch || input.revision !== descriptor.revision || snapshot.epoch !== input.epoch || snapshot.revision !== input.revision) throw new HistoireSdkError('STALE_REVISION', 'Editor source publication changed')
  const { story } = input.target.variantId === null ? lookupStory(snapshot, input.target.storyId) : lookupTarget(snapshot, input.target.storyId, input.target.variantId)
  const source = snapshot.contents.get(story.filePath)?.source
  if (source?.kind !== 'file' || !source.absolutePath) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Collected target has no physical editor source')
  return source.absolutePath
}
