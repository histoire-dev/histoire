import { describe, expect, it, vi } from 'vitest'
import { getFloatingUiFrame, guardFloatingUiFrameReads } from '../../../../../histoire-vendors/build/floating-ui-frames.mjs'

describe('vendored Floating UI frame ownership', () => {
  it('never reads frameElement for local positioning or an opaque cross-origin parent', () => {
    const read = vi.fn(() => {
      throw new Error('Cross-origin access')
    })
    const window = { parent: {}, get frameElement() {
      return read()
    } }
    expect(getFloatingUiFrame(window, false)).toBeNull()
    expect(read).not.toHaveBeenCalled()
    window.parent = Object.create(null)
    expect(getFloatingUiFrame(window)).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it('retains permitted same-origin ancestor frames for coordinate composition', () => {
    const frame = { clientLeft: 2, clientTop: 3 }
    const outerFrame = { clientLeft: 4, clientTop: 5 }
    const parent = { parent: {}, frameElement: outerFrame }
    expect(getFloatingUiFrame({ parent, frameElement: frame })).toBe(frame)
    expect(getFloatingUiFrame(parent)).toBe(outerFrame)
  })

  it('backports only audited Floating UI DOM frame reads and rejects a changed upstream body', () => {
    const id = '/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs'
    const body = 'let currentIFrame = win.frameElement;\ncurrentIFrame = getWindow(currentIFrame).frameElement;'
    expect(guardFloatingUiFrameReads(body, '/story.js')).toBeNull()
    const guarded = guardFloatingUiFrameReads(body, id)
    expect(guarded).toContain('getFloatingUiFrame(win, Boolean(offsetParent && offsetWin !== win))')
    expect(guarded).toContain('getFloatingUiFrame(getWindow(currentIFrame))')
    expect(() => guardFloatingUiFrameReads('changed upstream', id)).toThrow('Floating UI frame backport requires review')
  })
})
