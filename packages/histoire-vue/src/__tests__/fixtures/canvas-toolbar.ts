import type { CanvasArrangement } from '../../../../histoire-app/src/app/stores/canvas.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import CanvasToolbar from '../../../../histoire-app/src/app/components/canvas/toolbar/CanvasToolbar.vue'
import ScreenshotPopover from '../../../../histoire-app/src/app/components/canvas/toolbar/ScreenshotPopover.vue'
import { createCanvasFrames, provideCanvas } from '../../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { toolbarGeometry } from './toolbar-geometry.js'

/** Compose genuine toolbar controls with existing canonical session fixture. */
export async function toolbarFixture(options: {
  /** Override toolbar-owned visibility to exercise an initially open or reconnected tool. */
  open?: string | null
} = {}) {
  const geometry = toolbarGeometry(1000)
  const source = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await session.connect()
  const canvas = createCanvasStore()
  const frames = createCanvasFrames(canvas)
  const screenshotOpen = ref(options.open)
  const screenshotTrigger = ref(0)
  const arrange = ref<CanvasArrangement>('grid')
  const arrangement = vi.fn((value: CanvasArrangement) => arrange.value = value)
  const wheel = vi.fn()
  const pointer = vi.fn()
  const Host = defineComponent({
    setup() {
      provideCanvas(canvas, frames)
      return () => h('div', { class: 'toolbar-test-host histoire-canvas-viewport', onWheel: wheel, onPointerdown: pointer }, h(CanvasToolbar, { arrange: arrange.value, onArrange: arrangement }, {
        screenshot: (slot: { open: string | null, setOpen: (value: string | null) => void }) => h(ScreenshotPopover, { 'storyId': 'a:b', 'variantId': 'c', 'open': screenshotOpen.value === undefined ? slot.open : screenshotOpen.value, 'trigger': screenshotTrigger.value, 'onUpdate:open': slot.setOpen }),
      }))
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session }, attachTo: document.body, slots: { default: () => h(Host) } })
  await geometry.flush()
  return { wrapper, geometry, session, canvas, frames, arrange, arrangement, wheel, pointer, screenshotOpen, screenshotTrigger }
}

/** Resolve a genuine native action whether inline or teleported into dropdown. */
export function toolbarButton(label: string): HTMLButtonElement {
  const value = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!value) throw new Error(`Missing toolbar action: ${label}`)
  return value
}
