import { describe, expect, it, vi } from 'vitest'
import { createSessionOptions, STORY_ID, useVariantTestSession, VARIANT_ID } from '../utils/variant-test-session.js'

describe('createVariantTestSession lazy story entries', () => {
  const runtime = useVariantTestSession()

  it('loads the selected story metadata and module loader on first use only', async () => {
    const { files: [file] } = createSessionOptions()
    const files: typeof file[] = []
    const moduleLoaders: Record<string, () => Promise<{ default: object }>> = {}
    const loader = vi.fn(async () => ({ default: {} }))
    // Mirrors the generated runtime: the entry fills the shared lookup tables.
    const loadStoryEntry = vi.fn(async (storyId: string) => {
      if (storyId !== STORY_ID || moduleLoaders[storyId]) return
      files.push(file)
      moduleLoaders[storyId] = loader
    })
    const session = runtime.createVariantTestSession(createSessionOptions({ files, moduleLoaders, loadStoryEntry }))

    const mapped = await session.loadStoryFile(STORY_ID)
    await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(mapped.story.id).toBe(STORY_ID)
    expect(loadStoryEntry).toHaveBeenCalledWith(STORY_ID)
    expect(loader).toHaveBeenCalledOnce()
  })

  it('reports a story without an entry as unknown', async () => {
    const session = runtime.createVariantTestSession(createSessionOptions({
      files: [],
      moduleLoaders: {},
      loadStoryEntry: async () => {},
    }))

    await expect(session.loadStoryFile('missing')).rejects.toThrow('Unknown histoire story "missing"')
  })
})
