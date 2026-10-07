import type { TailwindSnapshot } from '../../builtin-plugins/tailwind/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('generated Tailwind story test metadata', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../vendors/controls.js', () => ({
      HstCopyIcon: {},
      HstNumber: {},
      HstText: {},
      HstTextarea: {},
      HstTokenGrid: {},
      HstTokenList: {},
      useControlsTheme: vi.fn(),
    }))
    vi.doMock('../../vendors/vue.js', () => ({ createApp: vi.fn(), h: vi.fn() }))
  })

  it('brands generated Tailwind stories while leaving ordinary objects unmarked', async () => {
    const [{ createTailwindStory }, { isGeneratedStoryKnownEmpty }] = await Promise.all([
      import('../../builtin-plugins/tailwind/runtime/story.js'),
      import('../../generated-story-metadata.js'),
    ])
    const snapshot: TailwindSnapshot = {
      source: {
        id: 'tailwind-source',
        path: 'styles/tailwind.css',
        relativePath: 'styles/tailwind.css',
        title: 'Tailwind',
      },
      version: '4.1.0',
      prefix: '',
      categories: [],
      config: {},
    }
    const story = createTailwindStory(snapshot, {})

    expect(isGeneratedStoryKnownEmpty(story)).toBe(true)
    expect(isGeneratedStoryKnownEmpty({ id: 'tailwind-source', variants: [] })).toBe(false)
  })
})
