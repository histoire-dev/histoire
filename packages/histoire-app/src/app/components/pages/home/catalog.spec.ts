import type { HistoireCatalog, HistoireCatalogStory } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { browseSections, orderedStories } from './catalog.js'

/** Minimal portable catalog entry; no executable story fixture. */
function story(id: string, docsOnly = false): HistoireCatalogStory {
  return { id, title: id, path: [], docsOnly, variants: docsOnly ? [] : [{ id: 'one', title: 'One' }], content: { docs: docsOnly, rawSource: false } }
}

describe('home catalog navigation', () => {
  it('counts nested live stories and variants, hides empty sections and preserves top-level order', () => {
    const catalog: HistoireCatalog = {
      stories: [story('button'), story('intro', true), story('input')],
      diagnostics: [],
      tree: [
        { kind: 'group', title: 'Empty', children: [{ kind: 'story', title: 'Gone', storyId: 'gone' }] },
        { kind: 'folder', title: 'Forms', children: [{ kind: 'story', title: 'Input', storyId: 'input' }, { kind: 'folder', title: 'Nested', children: [{ kind: 'story', title: 'Button', storyId: 'button' }] }] },
        { kind: 'story', title: 'Introduction', storyId: 'intro' },
      ],
    }
    expect(browseSections(catalog).map(section => [section.title, section.stories, section.variants, section.guides, section.target.storyId])).toEqual([
      ['Forms', 2, 2, 0, 'input'],
      ['Introduction', 0, 0, 1, 'intro'],
    ])
    expect(orderedStories(catalog).map(item => item.id)).toEqual(['input', 'button', 'intro'])
  })

  it('keeps guides in tree order, skips stale references and includes ungrouped catalog entries', () => {
    const catalog: HistoireCatalog = { stories: [story('orphan', true), story('last', true), story('first', true)], diagnostics: [], tree: [{ kind: 'group', title: 'Guides', children: [{ kind: 'story', title: 'First', storyId: 'first' }, { kind: 'story', title: 'Missing', storyId: 'missing' }, { kind: 'story', title: 'Last', storyId: 'last' }] }] }
    expect(orderedStories(catalog).filter(item => item.docsOnly).map(item => item.id)).toEqual(['first', 'last', 'orphan'])
  })

  it.each([
    { title: '', hasPreview: false, expectedTitle: 'Guides' },
    { title: '', hasPreview: true, expectedTitle: 'Stories' },
    { title: '   ', hasPreview: false, expectedTitle: 'Guides' },
    { title: 'Documentation', hasPreview: false, expectedTitle: 'Documentation' },
  ])('labels default group truthfully without changing catalog counts ($title, preview=$hasPreview)', ({ title, hasPreview, expectedTitle }) => {
    const stories = [story('intro', true), story('usage', true), ...(hasPreview ? [story('button')] : [])]
    const catalog: HistoireCatalog = { stories, diagnostics: [], tree: [{ kind: 'group', id: 'default', title, children: stories.map(story => ({ kind: 'story', title: story.title, storyId: story.id })) }] }
    expect(browseSections(catalog)).toEqual([{
      id: 'group:default',
      title: expectedTitle,
      stories: hasPreview ? 1 : 0,
      variants: hasPreview ? 1 : 0,
      guides: 2,
      target: hasPreview ? { storyId: 'button' } : { storyId: 'intro', variantId: null },
      storyIds: stories.map(story => story.id),
      storyTitles: stories.map(story => story.title),
    }])
    expect(catalog.tree[0].title).toBe(title)
  })
})
