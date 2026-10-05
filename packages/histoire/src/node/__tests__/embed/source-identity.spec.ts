import { describe, expect, it } from 'vitest'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { getEmbedSourceId } from '../../virtual/embed/identity.js'
import { captureEmbedSource, createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'

describe('stable opaque book identity', () => {
  it('shares sourceId across handles/restarts/builds and separates roots without changing provider identity', async () => {
    const fixture = await createEmbedSourceFixture()
    const other = await createEmbedSourceFixture()
    try {
      const first = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
      const replacement = createRuntimeCatalog({ projectId: 'another-node-project', epoch: 'restart-epoch', root: fixture.root })
      await replacement.publish(fixture.context)
      const restarted = createEmbedSource(fixture.context, replacement).getDescriptor()
      const built = await captureEmbedSource(fixture.context)
      expect(restarted.sourceId).toBe(first.sourceId)
      expect(built.getDescriptor().sourceId).toBe(first.sourceId)
      expect(restarted.epoch).not.toBe(first.epoch)
      expect(replacement.current.projectId).toBe('another-node-project')
      expect(createEmbedSource(other.context, other.catalog).getDescriptor().sourceId).not.toBe(first.sourceId)
      expect(getEmbedSourceId(`${fixture.root}/`)).toBe(first.sourceId)
      expect(first.sourceId).not.toContain(fixture.root)
    }
    finally {
      await fixture.close()
      await other.close()
    }
  })
})
