import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import BasePopover from '../../../histoire-app/src/app/components/base/popover/BasePopover.vue'
import { toolbarButton as button, toolbarFixture as fixture } from './fixtures/canvas-toolbar.js'
import { resetScreenshotChannel, screenshotChannel as uiChannel } from './fixtures/screenshot-channel.js'

vi.mock('virtual:$histoire-config', () => ({ config: { responsivePresets: [], backgroundPresets: [], theme: {} }, logos: {} }))
vi.mock('../../../histoire-app/src/app/util/ui-channel.js', async () => {
  const { screenshotTransport } = await import('./fixtures/screenshot-channel.js')
  return screenshotTransport
})

beforeEach(() => {
  uiChannel.autoReady = true
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetScreenshotChannel()
  document.body.replaceChildren()
})

describe('canvas toolbar overflow integration', () => {
  it('uses native Single dimensions for capture and responsive rotation', async () => {
    const test = await fixture()
    try {
      test.arrange.value = 'single'
      test.canvas.setArrangement('single')
      test.canvas.singleViewportSize = { width: 848, height: 748 }
      test.frames.registerFrame({ id: 'frame', storyId: 'a:b', variantId: 'c', rect: { x: 0, y: 0, width: 848, height: 748 } })
      test.canvas.selectedFrame = 'frame'
      test.canvas.setFrameBackground('frame', 'transparent', true, 'dark')
      test.canvas.setZoom(0.5)
      await test.geometry.flush()
      button('Screenshot').click()
      await test.geometry.flush()
      const capture = [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent?.trim() === 'Capture 1 frame')!
      capture.click()
      await test.geometry.flush()
      expect(uiChannel.send).toHaveBeenCalledWith('histoire:ui:screenshot', expect.objectContaining({ targets: [{ storyId: 'a:b', variantId: 'c' }], viewport: { width: 848, height: 748 }, scale: 1, background: '$checkerboard' }))
      button('Rotate viewport').click()
      await test.geometry.flush()
      expect(test.canvas.singleViewport.mode).toBe('fixed')
      expect(test.session.getSnapshot().settings).toMatchObject({ responsiveWidth: 848, responsiveHeight: 748, rotate: true })
    }
    finally {
      test.wrapper.unmount()
      await test.session.dispose()
    }
  })

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
      expect(button('Measure').title).toBe('Measurement isn’t available for this story')
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
      expect(uiChannel.send.mock.calls.filter(([event]) => event === 'histoire:ui:screenshot')).toHaveLength(1)
      test.geometry.resize(1000)
      await test.geometry.flush()
      button('Screenshot').click()
      await test.geometry.flush()
      expect([...document.querySelectorAll('button')].some(value => value.textContent?.trim() === 'Cancel capture')).toBe(true)
      expect(uiChannel.send.mock.calls.filter(([event]) => event === 'histoire:ui:screenshot-cancel')).toHaveLength(0)
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
