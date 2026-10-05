// @vitest-environment jsdom
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewElementInspection } from '../virtual/preview-runtime/element-inspection.js'

/** Executes the emitted element inspection with actual DOM selectors. */
function createInspection() {
  const postToParent = vi.fn()
  const runtime = runInNewContext(`${previewElementInspection()}; ({ handleElementInspection })`, {
    document,
    window,
    getComputedStyle,
    postToParent,
    MEASURE_REQUEST: 'measure',
    MEASURE_RESULT: 'measured',
    ELEMENT_PICK_REQUEST: 'pick',
    ELEMENT_PICK_RESULT: 'picked',
  })
  return { ...runtime, postToParent }
}

/** Gives jsdom fixed frame metrics without asserting presentation styles. */
function setRect(element: Element, x: number, y: number, width: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({}),
  })
}

describe('preview element inspection', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('returns stable unique test selector, frame metrics, and computed spacing', () => {
    document.body.innerHTML = '<main><button data-test-id="action" style="padding: 2px 3px; margin: 4px 5px">Hello</button></main>'
    const button = document.querySelector('button')!
    setRect(button, 12, 20, 40, 30)
    setRect(button.parentElement!, 10, 10, 200, 100)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => button) })
    const runtime = createInspection()
    runtime.handleElementInspection({ type: 'measure', x: 15, y: 25, requestId: 'one' }, { storyId: 'story', variantId: 'variant' })
    const message = runtime.postToParent.mock.calls[0][0]
    expect(message).toMatchObject({ type: 'measured', requestId: 'one', storyId: 'story', variantId: 'variant' })
    expect(document.querySelector(message.result.selector)).toBe(button)
    expect(message.result.selector).toBe('[data-test-id="action"]')
    expect(message.result.rect).toMatchObject({ x: 12, y: 20, width: 40, height: 30, right: 52, bottom: 50 })
    expect(message.result.parentRect).toMatchObject({ x: 10, width: 200 })
    expect(message.result.padding).toEqual({ top: 2, right: 3, bottom: 2, left: 3 })
    expect(message.result.margin).toEqual({ top: 4, right: 5, bottom: 4, left: 5 })
  })

  it('uses short structural selector when preferred attributes are duplicated', () => {
    document.body.innerHTML = '<section id="stable"><button data-test-id="duplicate">One</button><button data-test-id="duplicate">Two</button></section>'
    const button = document.querySelectorAll('button')[1]
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => button })
    const runtime = createInspection()
    runtime.handleElementInspection({ type: 'pick', x: 10, y: 10 }, {})
    const result = runtime.postToParent.mock.calls[0][0].result
    expect(result.selector).toBe('#stable > button:nth-of-type(2)')
    expect(document.querySelector(result.selector)).toBe(button)
    expect(result.text).toBe('Two')
  })

  it.each([[-1, 2], [2, Number.NaN], [Number.POSITIVE_INFINITY, 2], [1e8, 2]])('returns null for invalid frame coordinates %s %s', (x, y) => {
    const fromPoint = vi.fn()
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: fromPoint })
    const runtime = createInspection()
    runtime.handleElementInspection({ type: 'pick', x, y }, {})
    expect(runtime.postToParent).toHaveBeenCalledWith(expect.objectContaining({ result: null }))
    expect(fromPoint).not.toHaveBeenCalled()
  })

  it('returns null outside elements and bounds picked text', () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null })
    const runtime = createInspection()
    runtime.handleElementInspection({ type: 'pick', x: 10, y: 10 }, {})
    expect(runtime.postToParent).toHaveBeenLastCalledWith(expect.objectContaining({ result: null }))
    document.body.innerHTML = `<button>${'x'.repeat(4000)}</button>`
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.querySelector('button') })
    runtime.handleElementInspection({ type: 'pick', x: 10, y: 10 }, {})
    expect(runtime.postToParent.mock.calls[1][0].result.text).toHaveLength(1000)
  })
})
