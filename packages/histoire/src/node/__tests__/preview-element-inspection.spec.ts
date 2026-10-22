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

  it('returns measurable siblings with element index for gap measurement', () => {
    document.body.innerHTML = '<ul><li>One</li><li hidden></li><li>Two</li><li>Three</li></ul>'
    const [one, hidden, two, three] = Array.from(document.querySelectorAll('li'))
    setRect(one, 0, 0, 10, 10)
    setRect(hidden, 0, 0, 0, 0)
    setRect(two, 0, 20, 10, 10)
    setRect(three, 0, 40, 10, 10)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => two })
    const runtime = createInspection()
    runtime.handleElementInspection({ type: 'measure', x: 5, y: 25 }, {})
    const result = runtime.postToParent.mock.calls[0][0].result
    expect(result.siblings.map((rect: { y: number }) => rect.y)).toEqual([0, 20, 40])
    expect(result.index).toBe(1)
  })

  it('sends a bounded sibling window around element in long lists', () => {
    document.body.innerHTML = `<ul>${'<li>Item</li>'.repeat(200)}</ul>`
    const items = Array.from(document.querySelectorAll('li'))
    items.forEach((item, index) => setRect(item, 0, index * 20, 10, 10))
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => items[100] })
    const runtime = createInspection()
    runtime.handleElementInspection({ type: 'measure', x: 5, y: 5 }, {})
    const result = runtime.postToParent.mock.calls[0][0].result
    expect(result.siblings).toHaveLength(64)
    expect(result.siblings[result.index].y).toBe(2000)
  })

  /** Measure an element by point and return the frame token for later navigation. */
  function measureToken(runtime: ReturnType<typeof createInspection>, element: Element): string {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => element })
    runtime.handleElementInspection({ type: 'measure', x: 1, y: 1 }, {})
    return runtime.postToParent.mock.calls.at(-1)[0].result.token
  }

  it.each([
    ['parent', 'ul'],
    ['child', 'b'],
    ['next', 'li:nth-of-type(4)'],
    ['previous', 'li:nth-of-type(1)'],
    [undefined, 'li:nth-of-type(2)'],
  ])('navigates from measured node to %s', (relation, expected) => {
    document.body.innerHTML = '<ul><div><li>One</li><li><i></i><b>Two</b></li><li hidden></li><li>Three</li></div></ul>'
    for (const element of document.querySelectorAll('ul, li, b')) setRect(element, 0, 0, 10, 10)
    // Zero-size wrapper (display: contents) is skipped by parent navigation.
    setRect(document.querySelector('div')!, 0, 0, 0, 0)
    setRect(document.querySelector('i')!, 0, 0, 0, 0)
    setRect(document.querySelectorAll('li')[2], 0, 0, 0, 0)
    const runtime = createInspection()
    const token = measureToken(runtime, document.querySelectorAll('li')[1])
    runtime.handleElementInspection({ type: 'measure', x: Number.NaN, y: Number.NaN, token, relation }, {})
    const result = runtime.postToParent.mock.calls.at(-1)[0].result
    expect(document.querySelector(result.selector)).toBe(document.querySelector(expected))
  })

  it('describes the measured element path for a breadcrumb and navigates to an ancestor by depth', () => {
    // Histoire mount wrappers stay out of the breadcrumb and out of parent navigation.
    document.body.innerHTML = '<div id="app"><div class="__histoire-preview-canvas"><main id="root"><section class="stage card"><ul><li>One</li></ul></section></main></div></div>'
    for (const element of document.querySelectorAll('div, main, section, ul, li')) setRect(element, 0, 0, 10, 10)
    const runtime = createInspection()
    const token = measureToken(runtime, document.querySelector('li')!)
    expect(runtime.postToParent.mock.calls.at(-1)[0].result.path).toEqual(['main#root', 'section.stage', 'ul', 'li'])
    runtime.handleElementInspection({ type: 'measure', x: 0, y: 0, token, relation: 'parent', depth: 2 }, {})
    expect(runtime.postToParent.mock.calls.at(-1)[0].result.selector).toBe('#root > section')
    runtime.handleElementInspection({ type: 'measure', x: 0, y: 0, token, relation: 'parent', depth: 4 }, {})
    expect(runtime.postToParent.mock.calls.at(-1)[0]).toMatchObject({ result: null })
  })

  it('follows the measured node after siblings are reordered', () => {
    document.body.innerHTML = '<ul><li id="a">A</li><li id="b">B</li><li id="c">C</li></ul>'
    for (const element of document.querySelectorAll('li')) setRect(element, 0, 0, 10, 10)
    const runtime = createInspection()
    const token = measureToken(runtime, document.getElementById('b')!)
    document.querySelector('ul')!.prepend(document.getElementById('b')!)
    runtime.handleElementInspection({ type: 'measure', x: 0, y: 0, token, relation: 'next' }, {})
    expect(runtime.postToParent.mock.calls.at(-1)[0].result.selector).toBe('#a')
  })

  it('reports unresolved navigation when measured node is gone, and plain null when nothing is related', () => {
    document.body.innerHTML = '<ul><li id="a">A</li><li id="b">B</li></ul>'
    for (const element of document.querySelectorAll('li')) setRect(element, 0, 0, 10, 10)
    const runtime = createInspection()
    const last = measureToken(runtime, document.getElementById('b')!)
    runtime.handleElementInspection({ type: 'measure', x: 0, y: 0, token: last, relation: 'next' }, {})
    expect(runtime.postToParent.mock.calls.at(-1)[0]).toMatchObject({ result: null })
    expect(runtime.postToParent.mock.calls.at(-1)[0]).not.toHaveProperty('reason')
    document.getElementById('b')!.remove()
    for (const token of [last, 'unknown']) {
      runtime.handleElementInspection({ type: 'measure', x: 0, y: 0, token, relation: 'previous' }, {})
      expect(runtime.postToParent.mock.calls.at(-1)[0]).toMatchObject({ result: null, reason: 'unresolved' })
    }
  })
})
