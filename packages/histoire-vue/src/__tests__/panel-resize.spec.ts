import { describe, expect, it, vi } from 'vitest'
import { createPanelResizeController } from '../../../histoire-app/src/app/components/shell/panel-resize.js'

/** Small native-event fixture supplies pointer fields missing from jsdom. */
function pointer(type: string, target: HTMLElement, x: number, pointerId = 1): PointerEvent {
  const event = new Event(type, { cancelable: true })
  Object.defineProperties(event, { currentTarget: { value: target }, clientX: { value: x }, pointerId: { value: pointerId }, button: { value: 0 } })
  return event as PointerEvent
}

/** Each controller fixture owns width and native capture instrumentation. */
function setup(edge: 'start' | 'end' = 'end', direction: 'ltr' | 'rtl' = 'ltr') {
  let width = 280
  const target = document.createElement('div')
  target.setPointerCapture = vi.fn()
  target.hasPointerCapture = vi.fn(() => true)
  target.releasePointerCapture = vi.fn()
  const controller = createPanelResizeController({ getWidth: () => width, getBounds: () => ({ min: 200, max: 500 }), setWidth: value => width = value, getDirection: () => direction, edge })
  return { controller, target, width: () => width }
}

describe('panel resize ownership', () => {
  it.each([
    ['end', 'ltr', 320],
    ['start', 'ltr', 240],
    ['end', 'rtl', 240],
    ['start', 'rtl', 320],
  ] as const)('resizes %s edge with %s direction and ignores another pointer', (edge, direction, expected) => {
    const test = setup(edge, direction)
    test.controller.onPointerDown(pointer('pointerdown', test.target, 100))
    test.controller.onPointerMove(pointer('pointermove', test.target, 140, 2))
    expect(test.width()).toBe(280)
    test.controller.onPointerMove(pointer('pointermove', test.target, 140))
    expect(test.width()).toBe(expected)
    test.controller.onPointerEnd(pointer('pointercancel', test.target, 140))
    test.controller.onPointerMove(pointer('pointermove', test.target, 180))
    expect(test.width()).toBe(expected)
    expect(test.target.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('releases active capture during teardown and never accepts subsequent input', () => {
    const test = setup()
    test.controller.onPointerDown(pointer('pointerdown', test.target, 100))
    test.controller.close()
    test.controller.onPointerMove(pointer('pointermove', test.target, 150))
    test.controller.onPointerDown(pointer('pointerdown', test.target, 100))
    expect(test.width()).toBe(280)
    expect(test.controller.active.value).toBe(false)
    expect(test.target.setPointerCapture).toHaveBeenCalledTimes(1)
    expect(test.target.releasePointerCapture).toHaveBeenCalledTimes(1)
  })

  it('handles accessible keyboard resizing and clamps every change', () => {
    const test = setup('start')
    test.controller.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(test.width()).toBe(288)
    test.controller.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }))
    expect(test.width()).toBe(256)
    test.controller.onKeyDown(new KeyboardEvent('keydown', { key: 'End' }))
    expect(test.width()).toBe(500)
    test.controller.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(test.width()).toBe(500)
    test.controller.onKeyDown(new KeyboardEvent('keydown', { key: 'Home' }))
    expect(test.width()).toBe(200)
  })
})
