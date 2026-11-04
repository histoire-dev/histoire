/* eslint-disable no-control-regex -- asserts on escape sequences */
import { describe, expect, it } from 'vitest'
import { createStyle, detectColorLevel } from '../terminal/style.js'

describe('color decision', () => {
  it('disables color for NO_COLOR, FORCE_COLOR=0, dumb terminals and non-TTY output', () => {
    expect(detectColorLevel({ NO_COLOR: '1', COLORTERM: 'truecolor' }, true)).toBe(0)
    expect(detectColorLevel({ FORCE_COLOR: '0' }, true)).toBe(0)
    expect(detectColorLevel({ TERM: 'dumb' }, true)).toBe(0)
    expect(detectColorLevel({ COLORTERM: 'truecolor' }, false)).toBe(0)
  })

  it('picks the richest level the terminal advertises', () => {
    expect(detectColorLevel({ COLORTERM: 'truecolor' }, true)).toBe(3)
    expect(detectColorLevel({ TERM: 'xterm-256color' }, true)).toBe(2)
    expect(detectColorLevel({ TERM: 'xterm' }, true)).toBe(1)
    expect(detectColorLevel({ FORCE_COLOR: '2' }, false)).toBe(2)
  })

  it('leaves hue-only helpers plain without color', () => {
    const style = createStyle(0)
    expect(style.error('x')).toBe('x')
    expect(style.accent('x')).toBe('x')
    expect(style.hints('y copy · Esc back')).not.toMatch(/\u001B\[3|\u001B\[4/)
  })
})
