import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive, shallowRef } from 'vue'
import { useCanvasFrameAdmission } from '../../../../histoire-app/src/app/components/canvas/frame-admission.js'
import * as layout from '../../../../histoire-app/src/app/components/canvas/frame-layout.js'

let scope = effectScope()

beforeEach(() => {
  vi.useFakeTimers()
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Exercise genuine layout ranking with reactive geometry and an owned timer scope. */
function admissionFixture() {
  const frames = shallowRef(layout.layoutCanvasFrames('story', ['a', 'b', 'c'], { width: 100, height: 100 }, 'list'))
  const state = reactive({ y: 0, height: 100, budget: 1, selected: null as string | null, moving: false, context: 'story' })
  const calculate = vi.spyOn(layout, 'liveCanvasFrames')
  const live = scope.run(() => useCanvasFrameAdmission({
    frames: () => frames.value,
    viewport: () => ({ x: 0, y: state.y, width: 250, height: state.height }),
    budget: () => state.budget,
    selected: () => state.selected,
    moving: () => state.moving,
    context: () => state.context,
  }))!
  return { live, state, frames, calculate }
}

describe('settled canvas frame admission', () => {
  it('renders initial viewport immediately and checks only latest viewport after quiet input', () => {
    const test = admissionFixture()
    expect([...test.live.value]).toEqual([test.frames.value[0].id])
    expect(test.calculate).toHaveBeenCalledTimes(1)
    test.state.y = test.frames.value[1].y
    vi.advanceTimersByTime(100)
    test.state.y = test.frames.value[2].y
    vi.advanceTimersByTime(149)
    expect(test.calculate).toHaveBeenCalledTimes(1)
    expect([...test.live.value]).toEqual([test.frames.value[0].id])
    vi.advanceTimersByTime(1)
    expect([...test.live.value]).toEqual([test.frames.value[2].id])
    expect(test.calculate).toHaveBeenCalledTimes(2)
  })

  it('keeps previews while pointer remains held and admits final viewport on release', () => {
    const test = admissionFixture()
    test.state.moving = true
    test.state.y = test.frames.value[2].y
    vi.advanceTimersByTime(1000)
    expect(test.calculate).toHaveBeenCalledTimes(1)
    expect([...test.live.value]).toEqual([test.frames.value[0].id])
    test.state.moving = false
    expect([...test.live.value]).toEqual([test.frames.value[2].id])
    expect(test.calculate).toHaveBeenCalledTimes(2)
  })

  it('prioritizes explicit selection and enforces budget changes without waiting for movement', () => {
    const test = admissionFixture()
    test.state.moving = true
    test.state.y = test.frames.value[2].y
    test.state.selected = test.frames.value[1].id
    expect([...test.live.value]).toEqual([test.frames.value[1].id])
    test.state.budget = 2
    expect(test.live.value.size).toBe(2)
    expect([...test.live.value][0]).toBe(test.frames.value[1].id)
    test.state.budget = 0
    expect(test.live.value.size).toBe(0)
  })

  it('invalidates queued old-story admission immediately when context changes', () => {
    const test = admissionFixture()
    test.state.y = test.frames.value[2].y
    test.frames.value = layout.layoutCanvasFrames('other', ['a'], { width: 100, height: 100 }, 'list')
    test.state.y = 0
    test.state.context = 'other'
    expect([...test.live.value]).toEqual([test.frames.value[0].id])
    const calls = test.calculate.mock.calls.length
    vi.advanceTimersByTime(1000)
    expect(test.calculate).toHaveBeenCalledTimes(calls)
  })

  it('cancels scheduled admission when owner scope is disposed', () => {
    const test = admissionFixture()
    test.state.y = test.frames.value[2].y
    scope.stop()
    vi.advanceTimersByTime(1000)
    expect(test.calculate).toHaveBeenCalledTimes(1)
  })
})
