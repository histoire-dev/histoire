import type { HistoireReadonly, HistoireSnapshot, HistoireTarget } from '@histoire/protocol'

/** Current executable generation for an exact existing variant target. */
export function getCanvasTargetGeneration(snapshot: HistoireReadonly<HistoireSnapshot>, target: HistoireTarget): string | undefined {
  if (snapshot.status !== 'ready' || snapshot.stale || !snapshot.source) return
  const story = snapshot.catalog.stories.find(story => story.id === target.storyId)
  if (!story || !story.variants.some(variant => variant.id === target.variantId)) return
  const source = snapshot.source
  return JSON.stringify([source.url, source.sourceId, source.epoch, story.runtimeRevision ?? source.revision])
}
