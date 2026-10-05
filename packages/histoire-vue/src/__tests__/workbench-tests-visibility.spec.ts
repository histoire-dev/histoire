import { getHistoireTargetKey } from '@histoire/protocol'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { emptyTestEntry, isVisibleTestRow, projectTestRows } from '../../../histoire-app/src/app/components/panes/tests/projection.js'
import TestsTree from '../../../histoire-app/src/app/components/panes/tests/TestsTree.vue'
import { createEmbedDescriptor } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

describe('project test visibility', () => {
  it('hides empty siblings and stories while retaining skipped definitions and collection diagnostics', async () => {
    const catalog = createEmbedDescriptor().catalog
    catalog.diagnostics.push({ code: 'COLLECTION_FAILED', message: 'Broken collection', severity: 'error', relativePath: 'Broken.story.vue' })
    const target = { storyId: 'a:b', variantId: 'c' }
    const entries = new Map([[getHistoireTargetKey(target), { ...emptyTestEntry(target), collection: { definitions: [{ id: '0', name: 'skipped', fullName: 'skipped', mode: 'skip' as const }] } }]])
    const rows = projectTestRows(catalog, entries)
    expect(rows).toHaveLength(4)
    const visible = rows.filter(isVisibleTestRow)
    expect(visible.map(row => row.target)).toEqual([target, { storyId: 'Broken.story.vue', variantId: null }])
    virtualViewport()
    const wrapper = mount(TestsTree, { props: { rows: visible, filter: 'all', selected: null }, attachTo: document.body })
    try {
      expect(wrapper.text()).toContain('First')
      expect(wrapper.text()).not.toContain('Second')
      expect(wrapper.findAll('.test-row')).toHaveLength(2)
      await wrapper.setProps({ filter: 'failing' })
      expect(wrapper.find('.test-story-heading').exists()).toBe(false)
      expect(wrapper.findAll('.test-row')).toHaveLength(1)
      await wrapper.setProps({ rows: [] })
      expect(wrapper.text()).toBe('No tests')
    }
    finally { wrapper.unmount() }
  })

  it('uses current empty collection over historical results and catalog hint', () => {
    const row = projectTestRows(createEmbedDescriptor().catalog, new Map())[0]
    const summary = { ok: true, total: 1, passed: 1, failed: 0, skipped: 0, tests: [], errors: [] }
    expect(isVisibleTestRow({ ...row, hasTests: true })).toBe(true)
    expect(isVisibleTestRow({ ...row, summary })).toBe(true)
    expect(isVisibleTestRow({ ...row, hasTests: true, summary, stale: true, collection: { definitions: [] } })).toBe(false)
    expect(isVisibleTestRow({ ...row, stale: true, running: true })).toBe(false)
    expect(isVisibleTestRow({ ...row, collection: { definitions: [{ id: '0', name: 'todo', fullName: 'todo', mode: 'todo' }] } })).toBe(true)
    expect(isVisibleTestRow({ ...row, error: 'failed', notCollected: true })).toBe(true)
    const previousFailure = { ...summary, uncollectedStories: [{ relativePath: 'First.story.vue', error: 'Older collection failure' }] }
    const entries = new Map([[getHistoireTargetKey(row.target), { ...emptyTestEntry(row.target), summary: previousFailure, collection: { definitions: [] } }]])
    expect(projectTestRows(createEmbedDescriptor().catalog, entries).filter(isVisibleTestRow)).toHaveLength(0)
  })
})
