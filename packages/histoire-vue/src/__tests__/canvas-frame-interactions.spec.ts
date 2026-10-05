import { describe, expect, it, vi } from 'vitest'
import { bindCanvasFrameInteractions } from '../../../histoire-app/src/app/components/canvas/frame-interactions.js'
import { usePointerPan } from '../../../histoire-app/src/app/components/canvas/pan/usePointerPan.js'
import { useSpacePan } from '../../../histoire-app/src/app/components/canvas/pan/useSpacePan.js'

/** Build a same-origin frame with the production pan relay and activation hook. */
function frameFixture(options: { tool?: string, space?: boolean } = {}) {
  const root = document.createElement('div')
  const iframe = document.createElement('iframe')
  root.append(iframe)
  document.body.append(root)
  Object.defineProperties(iframe, {
    clientWidth: { configurable: true, value: 200 },
    clientHeight: { configurable: true, value: 120 },
  })
  const space = useSpacePan()
  space.held.value = Boolean(options.space)
  const pointer = usePointerPan({
    getTool: () => options.tool ?? 'select',
    getSpace: () => space.held.value,
    getOffset: () => ({ x: 0, y: 0 }),
    setOffset: () => {},
  })
  const activate = vi.fn()
  const wheel = vi.fn()
  const close = bindCanvasFrameInteractions(root, pointer, space, wheel, activate)
  const button = iframe.contentDocument!.createElement('button')
  const action = vi.fn()
  button.addEventListener('click', action)
  iframe.contentDocument!.body.append(button)
  return { root, iframe, button, action, activate, pointer, close }
}

/** Dispatch pointer input into the child document, where parent bubbling stops. */
function pointerDown(target: HTMLElement, button = 0): PointerEvent {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    button: { value: button },
    clientX: { value: 30 },
    clientY: { value: 40 },
  })
  target.dispatchEvent(event)
  return event as PointerEvent
}

describe('canvas frame iframe activation', () => {
  it('activates a normal primary press without preventing the preview click', () => {
    const test = frameFixture()
    try {
      const down = pointerDown(test.button)
      test.button.click()

      expect(test.activate).toHaveBeenCalledExactlyOnceWith(test.iframe, down)
      expect(down.defaultPrevented).toBe(false)
      expect(test.action).toHaveBeenCalledOnce()
    }
    finally {
      test.close()
      test.root.remove()
    }
  })

  it.each([
    { name: 'Pan tool', tool: 'pan', button: 0, space: false },
    { name: 'held Space', tool: 'select', button: 0, space: true },
    { name: 'middle mouse', tool: 'select', button: 1, space: false },
  ])('does not activate during $name input', ({ tool, button, space }) => {
    const test = frameFixture({ tool, space })
    try {
      pointerDown(test.button, button)
      expect(test.activate).not.toHaveBeenCalled()
    }
    finally {
      test.close()
      test.root.remove()
    }
  })

  it('rebinds once after iframe load and removes listeners on teardown', () => {
    const test = frameFixture()
    try {
      test.iframe.dispatchEvent(new Event('load'))
      pointerDown(test.button)
      expect(test.activate).toHaveBeenCalledOnce()

      test.close()
      pointerDown(test.button)
      expect(test.activate).toHaveBeenCalledOnce()
    }
    finally {
      test.close()
      test.root.remove()
    }
  })
})
