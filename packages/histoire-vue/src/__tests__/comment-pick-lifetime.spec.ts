import type { WorkbenchComments } from '../../../histoire-app/src/app/stores/comments.js'
import { ELEMENT_PICK_RESULT } from '@histoire/shared'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useCommentPick } from '../../../histoire-app/src/app/components/comments/pick.js'
import { createCanvasFrames } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { canvasRuntimeFixture } from './fixtures/canvas-runtime.js'

afterEach(() => vi.useRealTimers())

describe('comment pick activation ownership', () => {
  it.each(['reply', 'timeout', 'current'] as const)('accepts only current registration on %s', async (completion) => {
    vi.useFakeTimers()
    const fixture = canvasRuntimeFixture()
    await fixture.session.connect()
    await fixture.session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const container = document.createElement('div')
    document.body.append(container)
    await fixture.session.mount(container, { surface: 'preview' }).ready
    const iframe = container.querySelector('iframe')!
    const frames = createCanvasFrames(createCanvasStore())
    const registration = { id: 'frame', storyId: 'a:b', variantId: 'c', rect: { x: 0, y: 0, width: 100, height: 100 }, iframe, documentId: 'document-1', session: fixture.session }
    frames.registerFrame(registration)
    const compose = vi.fn(() => true)
    const model = { available: ref(true), compose } as unknown as WorkbenchComments
    const post = vi.spyOn(frames, 'postToFrame').mockReturnValue(true)
    let picker!: ReturnType<typeof useCommentPick>
    const wrapper = mount(defineComponent({ setup() {
      picker = useCommentPick(model, frames)
      return () => h('div')
    } }))
    try {
      picker.pick({ frameKey: 'frame', storyId: 'a:b', variantId: 'c', point: { x: 10, y: 10 } })
      if (completion !== 'current') {
        frames.frames.delete('frame')
        frames.registerFrame({ ...registration })
      }
      if (completion === 'timeout') {
        await vi.advanceTimersByTimeAsync(700)
      }
      else {
        window.dispatchEvent(new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe.contentWindow,
          data: { __histoire: true, type: ELEMENT_PICK_RESULT, documentId: 'document-1', storyId: 'a:b', variantId: 'c', requestId: post.mock.calls[0][1].requestId, result: { selector: 'button' } },
        }))
      }
      expect(compose).toHaveBeenCalledTimes(completion === 'current' ? 1 : 0)
    }
    finally {
      wrapper.unmount()
      await fixture.session.dispose()
      container.remove()
    }
  })
})
