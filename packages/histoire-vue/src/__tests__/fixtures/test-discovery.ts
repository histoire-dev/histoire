import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Real connected source with deterministic executable provenance. */
export async function setupTestDiscovery() {
  const fixture = sourceFixture()
  for (const story of fixture.descriptor.catalog.stories) story.runtimeRevision = 'a'.repeat(64)
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  /** Full collection explicitly acknowledges every empty variant. */
  function collection(tested = true, storyId?: string): HistoireProjectTestCollectionResult {
    const source = session.getSnapshot().source!
    return { execution: { runId: 'discovery', mode: 'server', sourceId: source.sourceId, epoch: source.epoch, revision: source.revision }, variants: fixture.descriptor.catalog.stories.filter(story => !story.docsOnly && (!storyId || story.id === storyId)).flatMap(story => story.variants.map(variant => ({ target: { storyId: story.id, variantId: variant.id }, collection: { definitions: tested && variant.id === 'c' ? [{ id: '0', name: 'test', fullName: 'test' }] : [] } }))) }
  }
  return { fixture, session, collection }
}
