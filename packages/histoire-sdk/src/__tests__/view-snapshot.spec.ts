import { describe, expect, it } from 'vitest'
import { createEmbedSnapshot } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'
import { createMountViewSnapshot } from '../mounts/view-snapshot.js'

describe('mounted view metadata projection', () => {
  it.each(['preview', 'grid'] as const)('retains selected story and every sibling variant for %s', (surface) => {
    const snapshot = createEmbedSnapshot()
    snapshot.selection = { storyId: 'a:b', variantId: 'c' }
    snapshot.events = { items: [], droppedCount: 7 }
    const project = createMountViewSnapshot(surface)
    const view = project(snapshot)
    expect(view.catalog.stories).toEqual([snapshot.catalog.stories[0]])
    expect(view.catalog.stories[0].variants.map(variant => variant.id)).toEqual(['c', 'other'])
    expect(view.catalog.tree).toEqual([])
    for (const field of ['source', 'selection', 'runtime', 'state', 'settings', 'capabilities', 'diagnostics'] as const) expect(view[field]).toBe(snapshot[field])
    expect(view.catalog.diagnostics).toBe(snapshot.catalog.diagnostics)
    expect(view.events).toEqual({ items: [], droppedCount: 7 })
  })

  it('retains every duplicate story match instead of hiding ambiguous owners', () => {
    const snapshot = createEmbedSnapshot()
    snapshot.selection = { storyId: 'a:b', variantId: 'c' }
    snapshot.catalog = { ...snapshot.catalog, stories: [...snapshot.catalog.stories, { ...snapshot.catalog.stories[0], title: 'Duplicate' }] }
    const view = createMountViewSnapshot('grid')(snapshot)
    expect(view.catalog.stories.map(story => story.title)).toEqual(['First', 'Duplicate'])
  })

  it.each(['explorer', 'tree', 'search', 'toolbar', 'controls', 'docs', 'source', 'events', 'tests'] as const)('preserves complete metadata for %s', (surface) => {
    const snapshot = createEmbedSnapshot()
    snapshot.selection = { storyId: 'a:b', variantId: 'c' }
    expect(createMountViewSnapshot(surface)(snapshot).catalog).toBe(snapshot.catalog)
  })

  it('keeps immutable host metadata complete while empty and docs-only views execute no story', () => {
    const snapshot = createEmbedSnapshot()
    Object.freeze(snapshot.catalog.stories)
    Object.freeze(snapshot.catalog)
    Object.freeze(snapshot)
    const project = createMountViewSnapshot('preview')
    expect(project(snapshot).catalog.stories).toEqual([])
    const docs = project({ ...snapshot, selection: { storyId: 'docs', variantId: null } })
    expect(docs.catalog.stories).toEqual([snapshot.catalog.stories[2]])
    expect(docs.catalog.stories[0].variants).toEqual([])
    expect(snapshot.catalog.stories).toHaveLength(3)
    expect(snapshot.catalog.tree).toHaveLength(1)
    expect(snapshot.selection).toBeNull()
  })

  it('reuses current-story metadata for state updates and replaces it after catalog publication', () => {
    const snapshot = createEmbedSnapshot()
    snapshot.selection = { storyId: 'a:b', variantId: 'c' }
    const project = createMountViewSnapshot('grid')
    const initial = project(snapshot)
    const edited = project({ ...snapshot, selection: { storyId: 'a:b', variantId: 'other' }, state: { target: snapshot.selection, runtimeId: 'runtime', value: { count: 2 } } })
    expect(edited.catalog).toBe(initial.catalog)
    const catalog = { ...snapshot.catalog, stories: snapshot.catalog.stories.map(story => story.id === 'a:b' ? { ...story, title: 'Updated', variants: [...story.variants, { id: 'new', title: 'New' }] } : story) }
    const updated = project({ ...snapshot, catalog })
    expect(updated.catalog).not.toBe(initial.catalog)
    expect(updated.catalog.stories[0].title).toBe('Updated')
    expect(updated.catalog.stories[0].variants.at(-1)?.id).toBe('new')
    expect(project({ ...snapshot, catalog, selection: { storyId: 'a', variantId: 'b:c' } }).catalog.stories.map(story => story.id)).toEqual(['a'])
    expect(project({ ...snapshot, catalog, selection: null }).catalog.stories).toEqual([])
  })

  it('isolates cache ownership between independently mounted views', () => {
    const snapshot = createEmbedSnapshot()
    snapshot.selection = { storyId: 'a:b', variantId: 'c' }
    const left = createMountViewSnapshot('preview')
    const right = createMountViewSnapshot('grid')
    const first = left(snapshot)
    const second = right(snapshot)
    expect(first.catalog).not.toBe(second.catalog)
    right({ ...snapshot, selection: { storyId: 'a', variantId: 'b:c' } })
    expect(left(snapshot).catalog).toBe(first.catalog)
    expect(first.catalog.stories.map(story => story.id)).toEqual(['a:b'])
  })
})
