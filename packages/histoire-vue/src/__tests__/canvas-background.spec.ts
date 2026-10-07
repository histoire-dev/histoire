import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import BackgroundPicker from '../../../histoire-app/src/app/components/canvas/toolbar/BackgroundPicker.vue'
import { createCanvasFrames, provideCanvas } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { getBackgroundCapture, getBackgroundPreset, withCheckerboardPresets } from '../../../histoire-app/src/app/util/background.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { toolbarGeometry } from './fixtures/toolbar-geometry.js'

vi.mock('virtual:$histoire-config', () => ({ config: { backgroundPresets: [{ label: 'Transparent', color: 'transparent' }, { label: 'White', color: '#fff' }], theme: {} }, logos: {} }))
let cleanup: (() => Promise<void>) | undefined

afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

/** Genuine picker and canonical settings with existing transport and geometry fixtures. */
async function fixture() {
  const geometry = toolbarGeometry(1000)
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  await session.connect()
  const canvas = createCanvasStore()
  const frames = createCanvasFrames(canvas)
  const post = vi.spyOn(frames, 'postToFrame')
  const Host = defineComponent({
    setup() {
      provideCanvas(canvas, frames)
      return () => h(BackgroundPicker, { open: 'background' })
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session }, attachTo: document.body, slots: { default: () => h(Host) } })
  cleanup = async () => {
    wrapper.unmount()
    await session.dispose()
  }
  await geometry.flush()
  return { geometry, session, canvas, post }
}

/** Resolve teleported controls through accessible names rather than swatch order. */
function button(label: string): HTMLButtonElement {
  const value = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    ?? [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent?.trim() === label)
  if (!value) throw new Error(`Missing background action: ${label}`)
  return value
}

/** Flush both session publication and Vue rendering after an action. */
async function click(label: string) {
  button(label).click()
  await flushPromises()
}

describe('canvas background choices', () => {
  it('appends unique checkerboards after solids and preserves configured labels', () => {
    expect(withCheckerboardPresets([
      { label: 'Light custom', color: '$checkerboard' },
      { label: 'White', color: '#fff' },
      { label: 'Duplicate', color: '$checkerboard' },
      { label: 'Dark custom', color: '$checkerboard-dark' },
    ]).map(value => value.label)).toEqual(['White', 'Light custom', 'Dark custom'])
    expect(getBackgroundPreset({ backgroundColor: 'transparent', checkerboard: true })).toBe('$checkerboard')
    expect(getBackgroundCapture({ backgroundColor: 'transparent', checkerboard: true, checkerboardTheme: 'dark' })).toBe('$checkerboard')
    expect(getBackgroundCapture({ backgroundColor: '#fff', checkerboard: false })).toBe('#fff')
  })

  it('offers both patterns and distinguishes transparent and solid selection', async () => {
    const test = await fixture()
    expect(button('Transparent').getAttribute('aria-pressed')).toBe('true')
    await click('Light checkerboard')
    expect(test.session.getSnapshot().settings).toMatchObject({ backgroundColor: 'transparent', checkerboard: true, checkerboardTheme: 'light' })
    expect(button('Transparent').getAttribute('aria-pressed')).toBe('false')
    expect(button('Light checkerboard').getAttribute('aria-pressed')).toBe('true')
    await click('Dark checkerboard')
    expect(test.session.getSnapshot().settings).toMatchObject({ checkerboard: true, checkerboardTheme: 'dark' })
    expect(button('Light checkerboard').getAttribute('aria-pressed')).toBe('false')
    expect(button('Dark checkerboard').getAttribute('aria-pressed')).toBe('true')
    await click('White')
    expect(test.session.getSnapshot().settings).toMatchObject({ backgroundColor: '#fff', checkerboard: false, checkerboardTheme: 'light' })
  })

  it('inherits global choice for Selected then isolates override and clears it for All frames', async () => {
    const test = await fixture()
    await click('Dark checkerboard')
    test.canvas.selectedFrame = 'selected'
    test.canvas.setFrameBackground('sibling', '#fff')
    await test.geometry.flush()
    await click('Selected')
    expect(button('Dark checkerboard').getAttribute('aria-pressed')).toBe('true')
    await click('Light checkerboard')
    expect(test.canvas.frameBackgrounds.selected).toEqual({ backgroundColor: 'transparent', checkerboard: true, checkerboardTheme: 'light' })
    expect(test.canvas.frameBackgrounds.sibling.backgroundColor).toBe('#fff')
    expect(test.session.getSnapshot().settings.checkerboardTheme).toBe('dark')
    expect(test.post).toHaveBeenCalledWith('selected', expect.objectContaining({ settings: expect.objectContaining({ checkerboardTheme: 'light' }) }))
    expect(button('Dark checkerboard').getAttribute('aria-pressed')).toBe('false')
    await click('All frames')
    expect(button('Dark checkerboard').getAttribute('aria-pressed')).toBe('true')
    await click('White')
    expect(test.canvas.frameBackgrounds).toEqual({})
    expect(test.session.getSnapshot().settings.checkerboard).toBe(false)
  })

  it('rejects invalid custom input without changing settings and valid hex disables checkerboard', async () => {
    const test = await fixture()
    await click('Dark checkerboard')
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Custom hex color"]')!
    input.value = 'red'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(test.session.getSnapshot().settings.checkerboardTheme).toBe('dark')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Enter a hex color')
    input.value = '#1234'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(test.session.getSnapshot().settings).toMatchObject({ backgroundColor: '#1234', checkerboard: false, checkerboardTheme: 'light' })
  })
})
