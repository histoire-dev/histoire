import type { HistoireCatalog, HistoireCatalogStory } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { documentNeighbors } from './navigation.js'

/** Minimal guide within one portable group. */
function guide(id: string, group: string): HistoireCatalogStory {
  return { id, title: id, group, docsOnly: true, path: [], variants: [], content: { docs: true, rawSource: false } }
}

describe('markdown document navigation', () => {
  it('follows tree order only among docs in current group', () => {
    const stories = [guide('third', 'docs'), guide('other', 'other'), guide('second', 'docs'), guide('first', 'docs')]
    const catalog: HistoireCatalog = { stories, diagnostics: [], tree: [{ kind: 'group', title: 'Guides', children: ['first', 'other', 'second', 'third'].map(storyId => ({ kind: 'story', title: storyId, storyId })) }] }
    expect(documentNeighbors(catalog, stories[2]).previous?.id).toBe('first')
    expect(documentNeighbors(catalog, stories[2]).next?.id).toBe('third')
    expect(documentNeighbors(catalog, stories[1])).toEqual({ previous: undefined, next: undefined })
  })
})
