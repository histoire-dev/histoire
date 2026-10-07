import type { Ref, ShallowRef } from 'vue'
import type { HistoireContainerSize } from '../provider/context.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireControls } from '../components/controls/HistoireControls.js'
import { useHistoireContext } from '../provider/context.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

/** Restore mocked browser APIs after each controls width regression. */
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Mount controls in a ready provider with controllable root geometry. */
async function controlsWidthFixture(initialWidth: number) {
  const observers = resizeObserverFixture()
  const rectWidths = new WeakMap<Element, number>()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = rectWidths.get(this) ?? (this.classList.contains('histoire-provider') ? initialWidth : 0)
    return new DOMRect(0, 0, width, 320)
  })

  const source = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount(document.createElement('div'), { surface: 'preview' }).ready

  let root: ShallowRef<HTMLElement | null> | undefined
  let size: Readonly<Ref<Readonly<HistoireContainerSize>>> | undefined
  const CaptureContext = defineComponent({
    setup() {
      /** Capture provider refs so tests can replace the observed root. */
      const context = useHistoireContext()
      root = context.root
      size = context.size
      return () => h(HistoireControls)
    },
  })
  const wrapper = mount(HistoireProvider, {
    props: { session },
    attachTo: document.body,
    slots: { default: () => h(CaptureContext) },
  })

  return {
    wrapper,
    session,
    observers,
    /** Read the provider root captured by the child component. */
    root: () => root!.value!,
    /** Expose provider root ref for replacement lifecycle assertions. */
    rootRef: () => root!,
    /** Read provider size after observer delivery. */
    size: () => size!,
    /** Set the next geometry reported for an observed element. */
    setWidth(element: Element, width: number) {
      rectWidths.set(element, width)
    },
    /** Dispose Vue observers and caller-owned session after assertions. */
    async close() {
      wrapper.unmount()
      wrapper.element.remove()
      await session.dispose()
    },
  }
}

/** Build a resize entry for a queued notification from a retired root. */
function resizeEntry(target: Element, width: number): ResizeObserverEntry {
  return { target, contentRect: new DOMRect(0, 0, width, 320) } as ResizeObserverEntry
}

describe('controls width observation', () => {
  /** Ensure controls rendering consumes cached provider width without layout reads. */
  it('uses cached provider width without reading clientWidth during render or snapshots', async () => {
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('histoire-provider') ? 777 : 0
    })
    const fixture = await controlsWidthFixture(640)
    const root = fixture.root()
    try {
      await nextTick()
      const controls = fixture.wrapper.get<HTMLElement>('.histoire-custom-controls').element
      expect(clientWidth).not.toHaveBeenCalled()
      expect(controls.style.width).toBe('640px')

      await fixture.session.state.patch({ count: 8 })
      await flushPromises()
      expect(controls.style.width).toBe('640px')
      expect(clientWidth).not.toHaveBeenCalled()
      expect(fixture.observers.count()).toBe(1)

      fixture.setWidth(root, 720)
      fixture.observers.deliver()
      await nextTick()
      expect(controls.style.width).toBe('720px')

      fixture.setWidth(root, 0)
      fixture.observers.deliver()
      await nextTick()
      expect(controls.style.width).toBe('0px')
      expect(clientWidth).not.toHaveBeenCalled()
    }
    finally {
      await fixture.close()
    }
  })

  /** Cover missing root, replacement, stale notifications, and observer teardown. */
  it('uses 420px before a root exists, follows root replacement, and ignores queued old-root callbacks', async () => {
    const fixture = await controlsWidthFixture(560)
    const oldRoot = fixture.root()
    let unmounted = false
    try {
      await nextTick()
      const controls = fixture.wrapper.get<HTMLElement>('.histoire-custom-controls').element
      expect(controls.style.width).toBe('560px')

      fixture.rootRef().value = null
      await nextTick()
      expect(controls.style.width).toBe('420px')

      const replacement = document.createElement('div')
      document.body.append(replacement)
      fixture.setWidth(replacement, 730)
      fixture.rootRef().value = replacement
      await nextTick()
      fixture.observers.deliver()
      await nextTick()
      expect(controls.style.width).toBe('730px')

      fixture.observers.notifyAll([resizeEntry(oldRoot, 980)])
      await nextTick()
      expect(controls.style.width).toBe('730px')

      const size = fixture.size()
      fixture.wrapper.unmount()
      unmounted = true
      fixture.wrapper.element.remove()
      expect(fixture.observers.count()).toBe(0)
      fixture.observers.notifyAll([resizeEntry(replacement, 900)])
      expect(size.value.width).toBe(730)
      replacement.remove()
    }
    finally {
      if (!unmounted) {
        fixture.wrapper.unmount()
        fixture.wrapper.element.remove()
      }
      await fixture.session.dispose()
    }
  })

  /** Ensure a retired observer cannot publish after an A/B/A root sequence. */
  it('ignores a retired callback when root identity returns after replacement', async () => {
    const fixture = await controlsWidthFixture(560)
    const rootA = fixture.root()
    const rootB = document.createElement('div')
    document.body.append(rootB)
    fixture.setWidth(rootB, 730)
    try {
      await nextTick()
      fixture.rootRef().value = rootB
      await nextTick()
      fixture.observers.deliver()
      await nextTick()

      const controls = fixture.wrapper.get<HTMLElement>('.histoire-custom-controls').element
      expect(controls.style.width).toBe('730px')

      fixture.setWidth(rootA, 840)
      fixture.rootRef().value = rootA
      await nextTick()
      fixture.observers.deliver()
      await nextTick()
      expect(controls.style.width).toBe('840px')

      fixture.observers.notifyObserver(0, [resizeEntry(rootA, 980)])
      await nextTick()
      expect(controls.style.width).toBe('840px')
      expect(fixture.observers.count()).toBe(1)
    }
    finally {
      rootB.remove()
      await fixture.close()
    }
  })
})
