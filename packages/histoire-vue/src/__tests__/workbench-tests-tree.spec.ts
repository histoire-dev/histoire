import { getHistoireTargetKey } from '@histoire/protocol'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { emptyTestEntry, projectTestRows } from '../../../histoire-app/src/app/components/panes/tests/projection.js'
import TestsTree from '../../../histoire-app/src/app/components/panes/tests/TestsTree.vue'
import { createEmbedDescriptor } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

/** Project rows from real catalog and entry helpers, including collection-error diagnostics. */
function rows(error?: string) {
  const catalog = createEmbedDescriptor().catalog
  catalog.stories = [{ ...catalog.stories[0], id: 'button', title: 'Button', variants: [{ id: 'primary', title: 'Primary' }, { id: 'secondary', title: 'Secondary' }] }]
  const entries = new Map(catalog.stories[0].variants.map((variant) => {
    const target = { storyId: 'button', variantId: variant.id }
    return [getHistoireTargetKey(target), { ...emptyTestEntry(target), summary: error ? null : { ok: true, total: 1, passed: 1, failed: 0, skipped: 0, errors: [], tests: [] }, error: error ? new Error(`${variant.title} ${error}`) : null }]
  }))
  return projectTestRows(catalog, entries)
}

describe('production TestsTree collection diagnostics', () => {
  it('reveals collapsed group diagnostics and restores disclosure with exact target activation', async () => {
    virtualViewport()
    const normalRows = rows()
    const wrapper = mount(TestsTree, {
      props: { rows: normalRows, filter: 'failing', selected: null },
      attachTo: document.body,
    })
    try {
      await wrapper.setProps({ filter: 'all' })
      await wrapper.get('.test-story-heading').trigger('click')
      expect(wrapper.findAll('.test-row')).toHaveLength(0)
      const diagnosticRows = rows('collection failed')
      await wrapper.setProps({ rows: diagnosticRows, filter: 'failing' })
      expect(wrapper.find('.test-story-heading').exists()).toBe(false)
      expect(wrapper.findAll('.test-row')).toHaveLength(2)
      expect(wrapper.findAll('.test-row')[1].attributes('title')).toContain('Secondary collection failed')
      await wrapper.findAll('.test-row')[1].trigger('click')
      expect(wrapper.emitted('select')?.[0]).toEqual([diagnosticRows[1]])
      await wrapper.setProps({ rows: normalRows, filter: 'all' })
      expect(wrapper.get('.test-story-heading').attributes('aria-expanded')).toBe('false')
      await wrapper.get('.test-story-heading').trigger('click')
      expect(wrapper.findAll('.test-row')).toHaveLength(2)
    }
    finally { wrapper.unmount() }
  })
})
