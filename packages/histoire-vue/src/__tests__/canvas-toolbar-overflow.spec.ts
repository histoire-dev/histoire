import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import BasePopover from '../../../histoire-app/src/app/components/base/popover/BasePopover.vue'
import CanvasToolbar from '../../../histoire-app/src/app/components/canvas/toolbar/CanvasToolbar.vue'
import ScreenshotPopover from '../../../histoire-app/src/app/components/canvas/toolbar/ScreenshotPopover.vue'
import { createCanvasFrames, provideCanvas } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { toolbarGeometry } from './fixtures/toolbar-geometry.js'

vi.mock('virtual:$histoire-config', () => ({ config: { responsivePresets: [], backgroundPresets: [], theme: {} }, logos: {} }))
const send = vi.hoisted(() => vi.fn((_event: string, _payload: unknown) => true))
vi.mock('../../../histoire-app/src/app/util/ui-channel.js', () => ({ sendUiEvent: send, onUiEvent: () => () => {}, onUiDisconnect: () => () => {} }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  send.mockClear()
  document.body.replaceChildren()
})

/** Compose genuine toolbar controls with existing canonical session fixture. */
async function fixture() {
  const geometry = toolbarGeometry(1000)
  const source = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await session.connect()
  const canvas = createCanvasStore()
  const frames = createCanvasFrames(canvas)
  const arrange = ref<'grid' | 'list' | 'matrix'>('grid')
  const arrangement = vi.fn((value: 'grid' | 'list' | 'matrix') => arrange.value = value)
  const wheel = vi.fn()
  const pointer = vi.fn()
  const Host = defineComponent({
    setup() {
      provideCanvas(canvas, frames)
      return () => h('div', { class: 'toolbar-test-host histoire-canvas-viewport', onWheel: wheel, onPointerdown: pointer }, h(CanvasToolbar, { arrange: arrange.value, matrixAvailable: true, onArrange: arrangement }, {
        screenshot: (slot: { open: string | null, setOpen: (value: string | null) => void }) => h(ScreenshotPopover, { 'storyId': 'a:b', 'variantId': 'c', 'open': slot.open, 'onUpdate:open': slot.setOpen }),
      }))
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session }, attachTo: document.body, slots: { default: () => h(Host) } })
  await geometry.flush()
  return { wrapper, geometry, session, canvas, frames, arrangement, wheel, pointer }
}

/** Resolve a genuine native action whether inline or teleported into dropdown. */
function button(label: string): HTMLButtonElement {
  const value = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!value) throw new Error(`Missing toolbar action: ${label}`)
  return value
}

describe('canvas toolbar overflow integration', () => {
  it('keeps Measure in exclusive tool group through selection and overflow transitions', async () => {
    const test = await fixture()
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    try {
      expect(button('Measure').disabled).toBe(true)
      test.frames.registerFrame({ id: 'frame', storyId: 'a:b', variantId: 'c', iframe, documentId: 'document', rect: { x: 0, y: 0, width: 720, height: 640 } })
      test.canvas.selectedFrame = 'frame'
      await test.geometry.flush()
      const tools = ['Select', 'Pan', 'Measure'].map(button)
      const group = tools[0].closest('[role="group"]')
      expect(group).not.toBeNull()
      expect(tools.every(tool => tool.closest('[role="group"]') === group)).toBe(true)
      expect(button('Measure').disabled).toBe(false)
      button('Measure').click()
      await nextTick()
      button('Measure').click()
      await nextTick()
      expect(test.canvas.tool).toBe('measure')
      expect(tools.map(tool => tool.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
      button('Pan').click()
      await nextTick()
      expect(test.canvas.tool).toBe('pan')
      button('Select').click()
      await nextTick()
      expect(test.canvas.tool).toBe('select')
      test.geometry.resize(40)
      await test.geometry.flush()
      button('More canvas tools').click()
      await test.geometry.flush()
      expect(tools.map(tool => tool.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio', 'menuitemradio'])
      expect(tools.map(tool => tool.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
      button('Measure').click()
      await test.geometry.flush()
      expect(button('More canvas tools').getAttribute('aria-expanded')).toBe('false')
      test.geometry.resize(1000)
      await test.geometry.flush()
      expect(test.canvas.tool).toBe('measure')
      expect(button('Measure').getAttribute('aria-pressed')).toBe('true')
      iframe.src = 'https://foreign.test/preview'
      test.frames.getFrame('frame')!.documentId = 'foreign'
      await test.geometry.flush()
      expect(button('Measure').disabled).toBe(true)
      expect(button('Measure').title).toBe('Measure requires a mounted same-origin frame')
    }
    finally {
      test.wrapper.unmount()
      iframe.remove()
      await test.session.dispose()
    }
  })

  it('keeps descendant panel bounds owned by canvas after triggers teleport', async () => {
    const test = await fixture()
    try {
      test.canvas.inspectorWidth = 20
      test.geometry.resize(100)
      await test.geometry.flush()
      button('More canvas tools').click()
      await test.geometry.flush()
      button('Viewport').click()
      await test.geometry.flush()
      const panels = test.wrapper.findAllComponents(BasePopover)
      const root = panels.find(panel => panel.props('role') === 'menu')!
      const child = panels.find(panel => panel.props('label') === 'Viewport')!
      const rootBounds = root.props('bounds') as () => unknown
      const childBounds = child.props('bounds') as () => unknown
      expect(childBounds()).toEqual(rootBounds())
    }
    finally {
      test.wrapper.unmount()
      await test.session.dispose()
    }
  })

  it('runs canonical actions once, preserves selection semantics and contains canvas input', async () => {
    const test = await fixture()
    try {
      expect(button('Rotate viewport').hasAttribute('aria-pressed')).toBe(true)
      expect(button('Zoom out').getAttribute('role')).toBeNull()
      test.geometry.resize(40)
      await test.geometry.flush()
      button('More canvas tools').click()
      await test.geometry.flush()
      expect(button('Grid').getAttribute('role')).toBe('menuitemradio')
      expect(button('Grid').getAttribute('aria-checked')).toBe('true')
      expect(button('Measure').disabled).toBe(true)
      button('List').click()
      await test.geometry.flush()
      expect(test.arrangement).toHaveBeenCalledExactlyOnceWith('list')
      button('More canvas tools').click()
      await test.geometry.flush()
      button('Rotate viewport').click()
      await nextTick()
      expect(test.session.getSnapshot().settings.rotate).toBe(true)
      button('More canvas tools').click()
      await test.geometry.flush()
      const zoom = test.canvas.effectiveZoom
      button('Zoom in').click()
      await nextTick()
      expect(test.canvas.effectiveZoom).toBe(zoom * 1.25)
      button('Pan').dispatchEvent(new Event('pointerdown', { bubbles: true }))
      test.wrapper.get('[role="toolbar"]').element.dispatchEvent(new Event('wheel', { bubbles: true }))
      expect(test.pointer).not.toHaveBeenCalled()
      expect(test.wheel).not.toHaveBeenCalled()
    }
    finally {
      test.wrapper.unmount()
      await test.session.dispose()
    }
  })

  it('retains viewport drafts and pending screenshot capture across overflow transitions', async () => {
    const test = await fixture()
    try {
      button('Viewport').click()
      await test.geometry.flush()
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Custom width"]')!
      input.value = '432'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      test.geometry.resize(100)
      await test.geometry.flush()
      expect(document.querySelector<HTMLInputElement>('input[aria-label="Custom width"]')?.value).toBe('432')
      button('Viewport').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await test.geometry.flush()
      button('More canvas tools').click()
      await test.geometry.flush()
      button('Screenshot').click()
      await test.geometry.flush()
      const capture = [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent?.trim() === 'Capture 1 frame')!
      capture.click()
      await test.geometry.flush()
      expect(send.mock.calls.filter(([event]) => event === 'histoire:ui:screenshot')).toHaveLength(1)
      test.geometry.resize(1000)
      await test.geometry.flush()
      button('Screenshot').click()
      await test.geometry.flush()
      expect([...document.querySelectorAll('button')].some(value => value.textContent?.trim() === 'Cancel capture')).toBe(true)
      expect(send.mock.calls.filter(([event]) => event === 'histoire:ui:screenshot-cancel')).toHaveLength(0)
      button('Viewport').click()
      await test.geometry.flush()
      expect(document.querySelector<HTMLInputElement>('input[aria-label="Custom width"]')?.value).toBe('432')
    }
    finally {
      test.wrapper.unmount()
      await test.session.dispose()
    }
  })
})
