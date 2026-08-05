import { describe, expect, it } from 'vitest'
import { getSerializedStoryData } from '../build-serialize.js'

/**
 * Builds a one-story context, optionally with a virtual module source (used to
 * detect vitest mocks).
 */
function createContext(moduleCode?: string) {
  return {
    storyFiles: [{
      relativePath: 'src/components/Example.story.vue',
      supportPluginId: 'vue3',
      treePath: ['Example'],
      virtual: !!moduleCode,
      moduleCode,
      markdownFile: null,
      story: {
        id: 'example',
        title: 'Example',
        docsText: 'A very long extracted documentation text',
        variants: [],
      },
    }],
    markdownFiles: [],
  } as any
}

describe('getSerializedStoryData', () => {
  it('strips docsText from the serialized story payload', () => {
    const data = getSerializedStoryData(createContext())

    expect(data.stories).toHaveLength(1)
    expect(data.stories[0].id).toBe('example')
    // docsText only feeds the build-time search index; shipping it in
    // histoire.json would bloat the payload with every story's full docs text.
    expect(data.stories[0]).not.toHaveProperty('docsText')
  })

  it('keeps docsText for vitest-mocked stories, whose component the app cannot load', () => {
    const data = getSerializedStoryData(createContext(`
      import { vi } from 'vitest'
      vi.mock('./dependency.js')
    `))

    // Their module only executes inside the preview iframe, so the rendered
    // <docs> block never reaches the app: without this the Docs tab of a
    // vitest-mocked story is blank in a built app.
    expect(data.stories[0].docsText).toBe('A very long extracted documentation text')
  })
})
