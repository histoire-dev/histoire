import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { GenericControls } from '../components/controls/GenericControls.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('generic controls JSON eligibility', () => {
  it.each(['cycle', 'bigint'] as const)('keeps %s mirror read-only while sibling edits reach canonical state', async (kind) => {
    const fixture = sourceFixture()
    const request = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation(async (command, payload) => {
      const result = await request(command, payload)
      // Automatic prop definitions are supplied by runtime, never host patch.
      if (result && 'value' in result) result.value._hPropDefs = [{ index: 0, name: 'Component', props: [{ name: 'config', types: ['object'] }] }]
      return result
    })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    const cycle: Record<string, unknown> = { title: 'Cycle' }
    cycle.self = cycle
    const value = kind === 'cycle' ? cycle : 12n
    await session.state.patch({ graph: value, _hPropState: { 0: { config: value } } })
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(GenericControls) } })
      expect(wrapper.findAll('output').map(output => output.text())).toEqual(['JSON editing unavailable', 'JSON editing unavailable'])
      await wrapper.get('input[type=number]').setValue('9')
      await vi.waitFor(() => expect(session.getSnapshot().state?.value.count).toBe(9))
      const canonical = await session.state.get()
      if (kind === 'cycle') expect(canonical.value.graph.self).toBe(canonical.value.graph)
      else expect(canonical.value.graph).toBe(12n)
      if (kind === 'cycle') expect(canonical.value._hPropState[0].config.self).toBe(canonical.value._hPropState[0].config)
      else expect(canonical.value._hPropState[0].config).toBe(12n)
      await wrapper.get('button[aria-label="Remove config override"]').trigger('click')
      await vi.waitFor(() => expect(session.getSnapshot().state?.value._hPropState[0]).toEqual({}))
      await session.state.patch({ graph: { editable: true } })
      await nextTick()
      expect(wrapper.text()).not.toContain('JSON editing unavailable')
      await session.state.patch({ graph: value })
      await nextTick()
      expect(wrapper.text()).toContain('JSON editing unavailable')
      const current = session.getSnapshot().state!.value.graph
      if (kind === 'cycle') expect(current.self).toBe(current)
      else expect(current).toBe(12n)
    }
    finally {
      wrapper?.unmount()
      await session.dispose()
    }
  })
})
