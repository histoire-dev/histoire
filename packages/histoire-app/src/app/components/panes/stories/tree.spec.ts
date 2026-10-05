import type { HistoireCatalog } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { createStoryTreeRows, nextTreeFocus } from './tree.js'

/** Compact catalog proves exact identities, group ordering, and docs-only behavior. */
function catalog(): HistoireCatalog {
  return {
    diagnostics: [],
    stories: [
      { id: 'button', title: 'Button', path: ['Actions', 'Button'], docsOnly: false, variants: [{ id: 'primary', title: 'Primary' }, { id: 'loading', title: 'Loading' }], content: { docs: false, rawSource: false } },
      { id: 'intro', title: 'Introduction', path: ['Introduction'], docsOnly: true, variants: [{ id: 'hidden', title: 'Hidden' }], content: { docs: true, rawSource: false } },
      { id: 'link', title: 'Link', path: ['Links', 'Link'], docsOnly: false, variants: [{ id: 'default', title: 'Default' }], content: { docs: false, rawSource: false } },
    ],
    tree: [
      { kind: 'group', id: 'foundations', title: 'Foundations', children: [{ kind: 'story', storyId: 'intro', title: 'Introduction' }] },
      { kind: 'group', id: 'components', title: 'Components', children: [
        { kind: 'folder', title: 'Actions', children: [{ kind: 'story', storyId: 'button', title: 'Button' }] },
        { kind: 'folder', title: 'Links', children: [{ kind: 'story', storyId: 'link', title: 'Link' }] },
      ] },
    ],
  }
}

describe('standalone story tree projection', () => {
  it('preserves groups and displays variants only beneath selected non-docs story', () => {
    const rows = createStoryTreeRows(catalog(), { storyId: 'button', variantId: 'primary' }, [['Actions']])
    expect(rows.map(row => row.title)).toEqual(['Foundations', 'Introduction', 'Components', 'Actions', 'Button', 'Primary', 'Loading', 'Links'])
    expect(rows.find(row => row.kind === 'variant' && row.title === 'Primary')?.selected).toBe(true)
    expect(createStoryTreeRows(catalog(), { storyId: 'intro', variantId: 'hidden' }, []).some(row => row.kind === 'variant')).toBe(false)
  })

  it('flattens unnamed structural groups without hiding their children or named headings', () => {
    const value = catalog()
    value.tree = [
      { kind: 'group', id: 'root', title: '', children: [{ kind: 'story', storyId: 'intro', title: 'Introduction' }] },
      { kind: 'group', id: 'blank', title: '  ', children: [{ kind: 'folder', title: 'Links', children: [{ kind: 'story', storyId: 'link', title: 'Link' }] }] },
      { kind: 'group', id: 'components', title: 'Components', children: [{ kind: 'story', storyId: 'button', title: 'Button' }] },
    ]
    const rows = createStoryTreeRows(value, { storyId: 'button', variantId: 'primary' }, [['Links']])
    expect(rows.map(row => row.title)).toEqual(['Introduction', 'Links', 'Link', 'Components', 'Button', 'Primary', 'Loading'])
    expect(rows.filter(row => row.kind === 'group').map(row => row.title)).toEqual(['Components'])
    expect(rows.find(row => row.title === 'Introduction')).toMatchObject({ depth: 0, target: { storyId: 'intro' } })
    expect(rows.find(row => row.title === 'Link')).toMatchObject({ depth: 1, target: { storyId: 'link' } })
    expect(rows.find(row => row.title === 'Primary')).toMatchObject({ selected: true, target: { storyId: 'button', variantId: 'primary' } })
  })

  it('shows only persisted expanded folders without changing their state', () => {
    const expanded: string[][] = [['Actions']]
    expect(createStoryTreeRows(catalog(), null, expanded).map(row => row.title)).toEqual(['Foundations', 'Introduction', 'Components', 'Actions', 'Button', 'Links'])
    expect(expanded).toEqual([['Actions']])
  })

  it('retains configured leaf titles and exact IDs rather than catalog offsets', () => {
    const value = catalog()
    value.tree = [{ kind: 'story', title: 'Configured label', storyId: 'button' }]
    const row = createStoryTreeRows(value, null, [])[0]
    expect(row).toMatchObject({ title: 'Configured label', target: { storyId: 'button' } })
  })

  it('moves through visible rows, enters children, and returns to parent', () => {
    const rows = createStoryTreeRows(catalog(), { storyId: 'button', variantId: 'primary' }, [['Actions']]).filter(row => row.kind !== 'group')
    const folder = rows.find(row => row.kind === 'folder' && row.title === 'Actions')!
    const story = rows.find(row => row.kind === 'story' && row.title === 'Button')!
    const variant = rows.find(row => row.kind === 'variant' && row.title === 'Primary')!
    expect(nextTreeFocus(rows, folder.key, 'ArrowRight')).toBe(story.key)
    expect(nextTreeFocus(rows, story.key, 'ArrowRight')).toBe(variant.key)
    expect(nextTreeFocus(rows, variant.key, 'ArrowLeft')).toBe(story.key)
    expect(nextTreeFocus(rows, rows[0].key, 'ArrowUp')).toBe(rows[0].key)
    expect(nextTreeFocus(rows, rows[0].key, 'End')).toBe(rows.at(-1)!.key)
  })

  it('folds current story variants without changing session selection or folder state', () => {
    const selected = { storyId: 'button', variantId: 'primary' }
    const rows = createStoryTreeRows(catalog(), selected, [['Actions']], false)
    expect(rows.find(row => row.kind === 'story' && row.title === 'Button')?.expanded).toBe(false)
    expect(rows.some(row => row.kind === 'variant')).toBe(false)
    expect(selected).toEqual({ storyId: 'button', variantId: 'primary' })
  })
})
