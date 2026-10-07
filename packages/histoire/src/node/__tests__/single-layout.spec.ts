import type { ServerStory, ServerStoryFile } from '@histoire/shared'
import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { finalizeCollectedStoryFile } from '../collect/finalize.js'

describe('explicit story layouts', () => {
  it.each([undefined, { type: 'single' as const }, { type: 'grid' as const }])('preserves provenance across repeated finalization for %j', (layout) => {
    const story = { id: 'story', title: 'Story', variants: [], layout } as ServerStory
    const file = { path: '/project/Story.story.vue' } as ServerStoryFile
    const context = { root: '/project', config: { tree: { file: ({ title }) => [title] } } } as Context
    finalizeCollectedStoryFile(file, context, story)
    expect(story.layoutExplicit).toBe(!!layout)
    expect(story.layout?.type).toBe(layout?.type ?? 'single')
    finalizeCollectedStoryFile(file, context, story)
    expect(story.layoutExplicit).toBe(!!layout)
  })

  it('treats project-declared default story layout as explicit', () => {
    const story = { id: 'story', title: 'Story', variants: [] } as ServerStory
    const file = { path: '/project/Story.story.vue' } as ServerStoryFile
    const context = { root: '/project', config: { tree: { file: 'title' }, defaultStoryProps: { layout: { type: 'single' } } } } as Context
    finalizeCollectedStoryFile(file, context, story)
    expect(story.layoutExplicit).toBe(true)
  })
})
