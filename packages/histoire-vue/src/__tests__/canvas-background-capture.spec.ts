import { getHistoireTargetKey } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useCommentScreenshot } from '../../../histoire-app/src/app/components/comments/capture.js'
import { createCanvasFrames } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createAiThreads } from '../../../histoire-app/src/app/stores/ai-threads.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

const send = vi.hoisted(() => vi.fn(() => true))
vi.mock('../../../histoire-app/src/app/util/ui-channel.js', () => ({ sendUiEvent: send, onUiEvent: () => () => {}, onUiDisconnect: () => () => {} }))

describe('checkerboard comment exports', () => {
  it.each(['light', 'dark'] as const)('exports transparent PNG for %s selected override', async (theme) => {
    send.mockClear()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
    await session.connect()
    const canvas = createCanvasStore()
    const frames = createCanvasFrames(canvas)
    const target = { storyId: 'a:b', variantId: 'c' }
    const id = getHistoireTargetKey(target)
    frames.registerFrame({ id, ...target, iframe: document.createElement('iframe'), session, rect: { x: 0, y: 0, width: 480, height: 320 } })
    canvas.setFrameBackground(id, 'transparent', true, theme)
    const model = createAiThreads({ available: true, send: () => true, subscribe: () => () => {}, disconnect: () => () => {} })
    model.enabled.value = true
    model.pinsEnabled.value = true
    model.composePin({ target, anchor: { x: 20, y: 30 } })
    const Host = defineComponent({
      setup() {
        const capture = useCommentScreenshot(model, frames, canvas)
        capture.capture()
        return () => null
      },
    })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) } })
    try {
      expect(send).toHaveBeenCalledWith('histoire:ui:screenshot', expect.objectContaining({ targets: [target], background: '$checkerboard', format: 'png', viewport: { width: 480, height: 320 } }))
      expect(session.getSnapshot().settings.checkerboard).toBe(false)
    }
    finally {
      wrapper.unmount()
      model.close()
      await session.dispose()
    }
  })
})
