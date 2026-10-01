import { afterEach, describe, expect, it, vi } from 'vitest'
import { restoreControlsFocus } from './focus'

/** Makes a focusable element visible in jsdom without testing CSS presentation. */
function visible<T extends HTMLElement>(element: T): T {
  vi.spyOn(element, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  return element
}

describe('controls overlay focus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
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
})
