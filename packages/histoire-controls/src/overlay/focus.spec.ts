import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusControlsSelectedOption, moveControlsOptionFocus, reconcileControlsOptionFocus, restoreControlsFocus } from './focus'

/** Makes a focusable element visible in jsdom without testing CSS presentation. */
function visible<T extends HTMLElement>(element: T): T {
  vi.spyOn(element, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  return element
}

describe('controls overlay focus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    delete window.__HST_CONTROLS_HOST__
    vi.restoreAllMocks()
  })

  it('continues Tab traversal beside the iframe at either end of the form', () => {
    const before = visible(document.createElement('button'))
    const frame = visible(document.createElement('iframe'))
    const after = visible(document.createElement('button'))
    document.body.append(before, frame, after)
    const anchor = visible(frame.contentDocument!.createElement('button'))
    frame.contentDocument!.body.append(anchor)
    restoreControlsFocus(anchor, { restoreFocus: true, focusDirection: 'next' })
    expect(document.activeElement).toBe(after)
    restoreControlsFocus(anchor, { restoreFocus: true, focusDirection: 'previous' })
    expect(document.activeElement).toBe(before)
  })

  it('skips disabled controls and restores the anchor after selection', () => {
    const anchor = visible(document.createElement('button'))
    const disabled = visible(document.createElement('input'))
    disabled.disabled = true
    const next = visible(document.createElement('textarea'))
    document.body.append(anchor, disabled, next)
    restoreControlsFocus(anchor, { restoreFocus: true, focusDirection: 'next' })
    expect(document.activeElement).toBe(next)
    restoreControlsFocus(anchor, { restoreFocus: true })
    expect(document.activeElement).toBe(anchor)
    next.focus()
    restoreControlsFocus(anchor, { restoreFocus: false })
    expect(document.activeElement).toBe(next)
  })

  it('relays traversal when browser exposes opaque cross-origin frame element', () => {
    const anchor = visible(document.createElement('button'))
    document.body.append(anchor)
    const requestFocus = vi.fn()
    window.__HST_CONTROLS_HOST__ = { requestFocus } as any
    const frame = document.createElement('iframe')
    Object.defineProperty(frame, 'ownerDocument', { get: () => {
      throw new DOMException('Cross-origin frame', 'SecurityError')
    } })
    vi.spyOn(window, 'frameElement', 'get').mockReturnValue(frame)
    expect(() => restoreControlsFocus(anchor, { restoreFocus: true, focusDirection: 'next' })).not.toThrow()
    expect(requestFocus).toHaveBeenCalledExactlyOnceWith('next')
  })

  it('does not read frameElement across opaque parent WindowProxy', () => {
    const anchor = visible(document.createElement('button'))
    document.body.append(anchor)
    const requestFocus = vi.fn()
    window.__HST_CONTROLS_HOST__ = { requestFocus } as any
    const frameElement = vi.fn(() => {
      throw new DOMException('Cross-origin frame', 'SecurityError')
    })
    const view = { parent: Object.create(null) }
    Object.defineProperty(view, 'frameElement', { get: frameElement })
    vi.spyOn(document, 'defaultView', 'get').mockReturnValue(view as Window)
    restoreControlsFocus(anchor, { restoreFocus: true, focusDirection: 'previous' })
    expect(frameElement).not.toHaveBeenCalled()
    expect(requestFocus).toHaveBeenCalledExactlyOnceWith('previous')
  })

  it('keeps keyboard position across updates and recovers disabled or removed choices', () => {
    const list = document.createElement('div')
    const first = document.createElement('button')
    const second = document.createElement('button')
    for (const button of [first, second]) {
      button.setAttribute('role', 'option')
      button.scrollIntoView = vi.fn()
    }
    list.append(first, second)
    document.body.append(list)
    second.setAttribute('aria-selected', 'true')
    focusControlsSelectedOption(list)
    expect(document.activeElement).toBe(second)
    reconcileControlsOptionFocus(list)
    expect(document.activeElement).toBe(second)
    second.disabled = true
    reconcileControlsOptionFocus(list)
    expect(document.activeElement).toBe(first)
    first.remove()
    reconcileControlsOptionFocus(list)
    expect(document.activeElement).not.toBe(second)
  })

  it('reveals focused listbox choice while preserving keyboard wrap and ignored keys', () => {
    const list = document.createElement('div')
    const buttons = [document.createElement('button'), document.createElement('button')]
    const scroll = buttons.map((button) => {
      button.setAttribute('role', 'option')
      button.scrollIntoView = vi.fn()
      return button.scrollIntoView
    })
    list.append(...buttons)
    document.body.append(list)
    buttons[0].focus()
    moveControlsOptionFocus(list, new KeyboardEvent('keydown', { key: 'End' }))
    expect(document.activeElement).toBe(buttons[1])
    expect(scroll[1]).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', inline: 'nearest' })
    moveControlsOptionFocus(list, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(document.activeElement).toBe(buttons[0])
    moveControlsOptionFocus(list, new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(scroll[0]).toHaveBeenCalledTimes(1)
  })
})
