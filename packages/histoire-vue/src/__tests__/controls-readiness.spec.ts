import type { HistoireBridgePublication } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireControls } from '../components/controls/HistoireControls.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('controls availability readiness', () => {
  it.each([true, false])('waits for owned custom-control availability before exposing generic state with custom=%s', async (hasControls) => {
    const source = sourceFixture()
    const original = source.adapters.mount
    let publish = (_event: HistoireBridgePublication) => {}
    let mountId = ''
    source.adapters.mount = (context) => {
      const surface = original(context)
      if (context.surface !== 'controls') return surface
      mountId = context.mountId
      return { ...surface, channel: { subscribe(listener) {
        publish = listener
        return () => {}
      }, post() {} } }
    }
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireControls) } })
    try {
      await flushPromises()
      await session.state.patch({ count: 8 })
      await flushPromises()
      expect(wrapper.find('input[type=number]').exists()).toBe(false)
      const snapshot = session.getSnapshot()
      const event: HistoireBridgePublication = { protocolVersion: 1, kind: 'event', sessionId: 'session', connectionId: 'controls', mountId, sourceId: snapshot.source!.sourceId, epoch: snapshot.source!.epoch, revision: snapshot.source!.revision, runtimeId: snapshot.runtime.runtimeId!, target: snapshot.selection!, event: 'controls.height', sequence: 0, payload: { hasControls, height: 32 } }
      publish({ ...event, runtimeId: 'retired' })
      await flushPromises()
      expect(wrapper.find('input[type=number]').exists()).toBe(false)
      publish(event)
      await flushPromises()
      expect(wrapper.find('input[type=number]').exists()).toBe(!hasControls)
      if (!hasControls) expect((wrapper.get('input[type=number]').element as HTMLInputElement).value).toBe('8')
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
