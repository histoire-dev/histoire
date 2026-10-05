import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { GenericControls } from '../components/controls/GenericControls.js'
import { StateControl } from '../components/controls/StateControl.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

/** Real controller delays runtime replies while native input receives newer user intents. */
async function editFixture() {
  const fixture = sourceFixture()
  const request = fixture.request.getMockImplementation()!
  const definitions = [{ index: 0, name: 'Greeting', props: [{ name: 'message', types: ['string'], value: 'Hello from story' }, { name: 'subtitle', types: ['string'], value: 'Subtitle' }] }]
  const replies: { reply: ReturnType<typeof deferred>, value: any }[] = []
  let delay = false
  fixture.request.mockImplementation(async (command, payload) => {
    const result = await request(command, payload)
    if (result && 'value' in result) result.value._hPropDefs = definitions
    if (delay && command === 'state.patch') {
      const reply = deferred<any>()
      replies.push({ reply, value: result })
      return reply.promise
    }
    return result
  })
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount(document.createElement('div'), { surface: 'preview' }).ready
  await session.state.patch({ text: 'Initial state' })
  delay = true
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => [h(StateControl, { field: 'text' }), h(GenericControls, { showState: false })] } })
  return { fixture, session, wrapper, replies,
    /** Settle one actual captured runtime reply, preserving source-owned definitions. */
    acknowledge(index: number) { replies[index].reply.resolve(replies[index].value) },
    /** Dispose controller first so abandoned acknowledgments cannot publish or leak. */
    async close() {
      wrapper.unmount()
      await session.dispose()
      for (const entry of replies) entry.reply.resolve(entry.value)
    } }
}

describe('native control edit acknowledgments', () => {
  it.each(['prop', 'state'])('keeps newest %s typing while earlier runtime state arrives', async (kind) => {
    const fixture = await editFixture()
    const input = kind === 'prop'
      ? fixture.wrapper.get('input[aria-label="message"]')
      : fixture.wrapper.get('input[type="text"]:not([aria-label="message"])')
    try {
      await input.setValue('N')
      await vi.waitFor(() => expect(fixture.replies).toHaveLength(1))
      await input.setValue('Na')
      await input.setValue('Native prop edit')
      fixture.acknowledge(0)
      await vi.waitFor(() => expect(fixture.replies).toHaveLength(2))
      expect((input.element as HTMLInputElement).value).toBe('Native prop edit')
      // Coalesced latest intent is admitted only after predecessor ACK. An older
      // response cannot race ahead of a newer patch and replace native input.
      fixture.acknowledge(1)
      await vi.waitFor(() => {
        const value = fixture.session.getSnapshot().state!.value
        expect(kind === 'prop' ? value._hPropState[0].message : value.text).toBe('Native prop edit')
      })
      expect((input.element as HTMLInputElement).value).toBe('Native prop edit')
      expect(fixture.replies).toHaveLength(2)
    }
    finally { await fixture.close() }
  })

  it('queues override removal after pending typing and restores source value', async () => {
    const fixture = await editFixture()
    const input = fixture.wrapper.get('input[aria-label="message"]')
    try {
      await input.setValue('Edited')
      await vi.waitFor(() => expect(fixture.replies).toHaveLength(1))
      fixture.acknowledge(0)
      await vi.waitFor(() => expect(fixture.wrapper.get('button[aria-label="Remove message override"]').attributes('disabled')).toBeUndefined())
      await input.setValue('Pending')
      await vi.waitFor(() => expect(fixture.replies).toHaveLength(2))
      await fixture.wrapper.get('button[aria-label="Remove message override"]').trigger('click')
      fixture.acknowledge(1)
      await vi.waitFor(() => expect(fixture.replies).toHaveLength(3))
      expect((input.element as HTMLInputElement).value).toBe('Hello from story')
      fixture.acknowledge(2)
      await vi.waitFor(() => expect(fixture.session.getSnapshot().state?.value._hPropState[0]).toEqual({}))
      expect((input.element as HTMLInputElement).value).toBe('Hello from story')
    }
    finally { await fixture.close() }
  })

  it('merges sibling prop edits from their latest accepted runtime state', async () => {
    const fixture = await editFixture()
    try {
      await fixture.wrapper.get('input[aria-label="message"]').setValue('First edit')
      await vi.waitFor(() => expect(fixture.replies).toHaveLength(1))
      await fixture.wrapper.get('input[aria-label="subtitle"]').setValue('Sibling edit')
      fixture.acknowledge(0)
      await vi.waitFor(() => expect(fixture.replies).toHaveLength(2))
      fixture.acknowledge(1)
      await vi.waitFor(() => expect(fixture.session.getSnapshot().state?.value._hPropState[0]).toEqual({ message: 'First edit', subtitle: 'Sibling edit' }))
    }
    finally { await fixture.close() }
  })

  it('drops queued typing after editor teardown without reporting stale errors', async () => {
    const fixture = await editFixture()
    try {
      const input = fixture.wrapper.get('input[aria-label="message"]')
      await input.setValue('Pending edit')
      await vi.waitFor(() => expect(fixture.replies).toHaveLength(1))
      await input.setValue('Queued edit')
      fixture.wrapper.unmount()
      fixture.acknowledge(0)
      await fixture.session.state.get()
      expect(fixture.replies).toHaveLength(1)
      expect(fixture.session.getSnapshot().state?.value._hPropState[0].message).toBe('Pending edit')
    }
    finally { await fixture.close() }
  })
})
