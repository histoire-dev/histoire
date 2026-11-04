import { describe, expect, it } from 'vitest'
import { displayWidth, fitWidth, wrapWidth } from '../terminal/width.js'

describe('display width', () => {
  it('counts wide, emoji, combining and joined glyphs by terminal cells', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('日本語')).toBe(6)
    expect(displayWidth('🚀')).toBe(2)
    expect(displayWidth('é')).toBe(1)
    expect(displayWidth('👨‍👩')).toBe(2)
    // Emoji-presentation symbols are wide; text-presentation ones in the same block are not.
    expect(displayWidth('✅⚡✨❌')).toBe(8)
    expect(displayWidth('☃')).toBe(1)
    expect(displayWidth('🫠')).toBe(2)
    // A skin-tone modifier colors the previous emoji instead of taking cells.
    expect(displayWidth('👍🏽')).toBe(2)
    expect(displayWidth('\u001B[7mab\u001B[27m')).toBe(2)
  })

  it('truncates by cells without splitting a wide glyph and keeps styling balanced', () => {
    expect(fitWidth('日本語です', 7)).toBe('日本語…')
    expect(displayWidth(fitWidth('日本語です', 7))).toBeLessThanOrEqual(7)
    expect(fitWidth('short', 10)).toBe('short')
    expect(fitWidth('\u001B[1mbold text here\u001B[22m', 6)).toBe('\u001B[1mbold …\u001B[0m')
    expect(fitWidth('x', 0)).toBe('')
  })

  it('wraps long text inside the budget', () => {
    expect(wrapWidth('日本語です', 6)).toEqual(['日本語', 'です'])
    expect(wrapWidth('ab\ncd', 5)).toEqual(['ab', 'cd'])
    // A glyph wider than the budget takes its own line rather than leaving an empty one before it.
    expect(wrapWidth('日a', 1)).toEqual(['日', 'a'])
  })
})
