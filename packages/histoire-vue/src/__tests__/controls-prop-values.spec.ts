import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { GenericControls } from '../components/controls/GenericControls.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

/** Source metadata stays runtime-owned while native controls dispatch real SDK patches. */
async function setup(definitions: unknown[]) {
  const fixture = sourceFixture()
  const request = fixture.request.getMockImplementation()!
  fixture.request.mockImplementation(async (command, payload) => {
    const result = await request(command, payload)
    if (result && 'value' in result) result.value._hPropDefs = definitions
    return result
  })
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount(document.createElement('div'), { surface: 'preview' }).ready
  await session.state.get()
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(GenericControls, { showState: false }) } })
  return { session, wrapper }
}

describe('runtime-collected prop values', () => {
  it('shows source value without creating an override and restores it after removing an edit', async () => {
    const definitions = [{ index: 0, name: 'Greeting', props: [{ name: 'message', types: ['string'], value: 'Hello from story', default: 'Default greeting' }] }]
    const { session, wrapper } = await setup(definitions)
    try {
      const input = wrapper.get('input[aria-label="message"]')
      expect((input.element as HTMLInputElement).value).toBe('Hello from story')
      expect(session.getSnapshot().state?.value._hPropState).toBeUndefined()
      await input.setValue('Edited greeting')
      await vi.waitFor(() => expect(session.getSnapshot().state?.value._hPropState[0].message).toBe('Edited greeting'))
      await wrapper.get('button[aria-label="Remove message override"]').trigger('click')
      await vi.waitFor(() => {
        expect((wrapper.get('input[aria-label="message"]').element as HTMLInputElement).value).toBe('Hello from story')
        expect(session.getSnapshot().state?.value._hPropState[0]).toEqual({})
      })
      expect(session.getSnapshot().state?.value._hPropDefs).toEqual(definitions)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('selects complete finite prop domains with exact scalar types and resets source value', async () => {
    const definitions = [{ index: 0, name: 'Choice', props: [
      { name: 'size', types: ['string'], value: 'small', values: ['small', 'large'] },
      { name: 'choice', types: ['string', 'number', 'boolean'], value: '1', enum: [1, '1', false, null] },
    ] }]
    const { session, wrapper } = await setup(definitions)
    try {
      const large = wrapper.get('[aria-label="size"]').findAll('button').find(button => button.text() === 'large')
      expect(large, 'Advertised large enum choice remains selectable').toBeDefined()
      await large!.trigger('click')
      await vi.waitFor(() => expect(session.getSnapshot().state?.value._hPropState[0].size).toBe('large'))
      const values = [{ label: '1', value: 1 }, { label: '"1"', value: '1' }, { label: 'false', value: false }, { label: 'null', value: null }]
      for (const { label, value } of values) {
        const option = wrapper.get('[aria-label="choice"]').findAll('button').find(button => button.text() === label)
        expect(option, `Advertised ${label} remains selectable`).toBeDefined()
        await option!.trigger('click')
        await vi.waitFor(() => expect(session.getSnapshot().state?.value._hPropState[0].choice).toBe(value))
      }
      await wrapper.get('[aria-label="Remove choice override"]').trigger('click')
      await vi.waitFor(() => expect(session.getSnapshot().state?.value._hPropState[0]).not.toHaveProperty('choice'))
      expect(session.getSnapshot().state?.value._hPropDefs).toEqual(definitions)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('keeps normal editing for incomplete, empty and oversized domains', async () => {
    const definitions = [{ index: 0, name: 'Fallback', props: [
      { name: 'incomplete', types: ['string'], value: 'small', values: ['small', {}, 'large'] },
      { name: 'empty', types: ['string'], value: 'source', values: [] },
      { name: 'oversized', types: ['string'], value: 'source', values: Array.from({ length: 65 }, (_, index) => String(index)) },
    ] }]
    const { session, wrapper } = await setup(definitions)
    try {
      for (const name of ['incomplete', 'empty', 'oversized']) {
        await wrapper.get(`input[aria-label="${name}"]`).setValue('free text')
        await vi.waitFor(() => expect(session.getSnapshot().state?.value._hPropState[0][name]).toBe('free text'))
      }
      expect(session.getSnapshot().state?.value._hPropDefs).toEqual(definitions)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('keeps long finite scalar values intact alongside numeric prop choices', async () => {
    const value = 'x'.repeat(500)
    const definitions = [{ index: 0, name: 'Bounded', props: [
      { name: 'tone', types: ['string'], value: 'short', values: ['short', value] },
      { name: 'level', types: ['number'], value: 1, values: [1, 2] },
    ] }]
    const { session, wrapper } = await setup(definitions)
    try {
      const long = wrapper.get('[aria-label="tone"]').findAll('button').find(button => button.text() === value)
      expect(long, 'Full finite scalar remains selectable').toBeDefined()
      await long!.trigger('click')
      await vi.waitFor(() => expect(session.getSnapshot().state?.value._hPropState[0].tone).toBe(value))
      await wrapper.get('[aria-label="level"]').findAll('button').find(button => button.text() === '2')!.trigger('click')
      await vi.waitFor(() => expect(session.getSnapshot().state?.value._hPropState[0].level).toBe(2))
      expect(session.getSnapshot().state?.value._hPropDefs).toEqual(definitions)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
