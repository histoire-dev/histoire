import { describe, expect, it, vi } from 'vitest'
import { createSingleResizeController } from '../../../histoire-app/src/app/components/canvas/single-resize.js'

/** Create a cancelable pointer-like event with jsdom-compatible native fields. */
function pointer(type: string, target: HTMLElement, x: number, y: number, pointerId = 1, button = 0): PointerEvent {
  const event = new Event(type, { cancelable: true })
  Object.defineProperties(event, {
    button: { value: button },
    clientX: { value: x },
    clientY: { value: y },
    currentTarget: { value: target },
    pointerId: { value: pointerId },
  })
  return event as PointerEvent
}

/** Build one controller with mutable geometry and recorded draft/commit output. */
function fixture(size = { width: 400, height: 300 }, zoom = 1) {
  let current = size
  const target = document.createElement('div')
  target.setPointerCapture = vi.fn()
  target.hasPointerCapture = vi.fn(() => true)
  target.releasePointerCapture = vi.fn()
  const resize = vi.fn((value: typeof size) => current = value)
  const commit = vi.fn()
  const start = vi.fn()
  const geometry = {
    frame: { left: 300, top: 100, right: 700, bottom: 400 },
    surface: { left: 100, top: 100, width: 800, scrollLeft: 0, scrollTop: 0 },
    zoom,
  }
  const controller = createSingleResizeController({
    getGeometry: () => geometry,
    getSize: () => current,
    onCommit: commit,
    onResize: resize,
    onStart: start,
  })
  return { commit, controller, current: () => current, geometry, resize, start, target }
}

describe('single viewport resize ownership', () => {
  it('keeps a centered width edge under the pointer and converts displayed movement through zoom', () => {
    const test = fixture({ width: 400, height: 300 }, 0.5)
    test.geometry.frame = { left: 400, top: 100, right: 600, bottom: 250 }
    test.controller.onPointerDown('width', pointer('pointerdown', test.target, 596, 150))
    test.controller.onPointerMove(pointer('pointermove', test.target, 646, 150))

    expect(test.current()).toEqual({ width: 600, height: 300 })
    expect(test.start).toHaveBeenCalledOnce()
    expect(test.resize).toHaveBeenCalledOnce()
    expect(test.controller.active.value).toBe(true)

    test.controller.onPointerEnd(pointer('pointerup', test.target, 646, 150))
    expect(test.commit).toHaveBeenCalledOnce()
    expect(test.commit).toHaveBeenCalledWith({ width: 600, height: 300 })
    expect(test.target.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('resizes overflow width and height, clamps bounds, and ignores unrelated pointers', () => {
    const test = fixture({ width: 1000, height: 300 })
    test.geometry.frame = { left: 100, top: 100, right: 1100, bottom: 400 }
    test.controller.onPointerDown('both', pointer('pointerdown', test.target, 1096, 396))
    test.controller.onPointerMove(pointer('pointermove', test.target, 1200, 900, 2))
    expect(test.resize).not.toHaveBeenCalled()

    test.controller.onPointerMove(pointer('pointermove', test.target, 20100, 0))
    expect(test.current()).toEqual({ width: 16384, height: 32 })
    test.controller.onPointerEnd(pointer('pointercancel', test.target, 20100, 0))
    expect(test.commit).toHaveBeenCalledWith({ width: 16384, height: 32 })
  })

  it('does not start or commit until a primary pointer changes an owned axis', () => {
    const test = fixture()
    test.controller.onPointerDown('width', pointer('pointerdown', test.target, 696, 200, 1, 1))
    expect(test.target.setPointerCapture).not.toHaveBeenCalled()

    test.controller.onPointerDown('width', pointer('pointerdown', test.target, 696, 200))
    test.controller.onPointerMove(pointer('pointermove', test.target, 696, 250))
    test.controller.onPointerEnd(pointer('pointerup', test.target, 696, 250))
    expect(test.start).not.toHaveBeenCalled()
    expect(test.resize).not.toHaveBeenCalled()
    expect(test.commit).not.toHaveBeenCalled()

    test.controller.onPointerDown('height', pointer('pointerdown', test.target, 500, 396))
    test.controller.onPointerMove(pointer('pointermove', test.target, 550, 396))
    test.controller.onPointerEnd(pointer('pointerup', test.target, 550, 396))
    expect(test.commit).not.toHaveBeenCalled()
  })

  it('supports accessible axis keys and retires active capture without a late commit', () => {
    const test = fixture()
    test.controller.onKeyDown('width', new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(test.commit).toHaveBeenLastCalledWith({ width: 408, height: 300 })
    test.controller.onKeyDown('height', new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }))
    expect(test.commit).toHaveBeenLastCalledWith({ width: 408, height: 332 })
    test.controller.onKeyDown('width', new KeyboardEvent('keydown', { key: 'Home' }))
    expect(test.commit).toHaveBeenLastCalledWith({ width: 32, height: 332 })
    test.controller.onKeyDown('height', new KeyboardEvent('keydown', { key: 'End' }))
    expect(test.commit).toHaveBeenLastCalledWith({ width: 32, height: 16384 })

    test.controller.onPointerDown('width', pointer('pointerdown', test.target, 696, 200))
    test.controller.onPointerMove(pointer('pointermove', test.target, 720, 200))
    const commits = test.commit.mock.calls.length
    test.controller.close()
    test.controller.onPointerEnd(pointer('pointerup', test.target, 720, 200))
    test.controller.onKeyDown('width', new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(test.commit).toHaveBeenCalledTimes(commits)
    expect(test.controller.active.value).toBe(false)
  })
})
