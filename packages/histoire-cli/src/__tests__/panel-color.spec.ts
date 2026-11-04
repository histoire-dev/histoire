import { describe, expect, it } from 'vitest'
import { renderPanel } from '../terminal/panel.js'
import { createProgressState } from '../terminal/progress/state.js'
import { createStyle } from '../terminal/style.js'
import { renderViewFrame } from '../terminal/views/frame.js'
import { displayWidth } from '../terminal/width.js'

const hints = [{ key: 'o', label: 'open' }, { key: 'r', label: 'restart' }, { key: '?', label: 'help' }, { key: 'q', label: 'quit' }]

describe('colored panel and frame', () => {
  it('keeps every line inside the width and closes styling at every level', () => {
    const snapshot = createProgressState().snapshot()
    for (const level of [0, 1, 2, 3] as const) {
      for (const columns of [100, 40, 12]) {
        const panel = renderPanel({ version: '1.0.0', columns, snapshot, url: 'http://localhost:6006/', segments: ['3 stories'], hints, style: createStyle(level) })
        const frame = renderViewFrame({ title: 'Logs', body: ['row'], footer: 'Up/Down scroll · y copy · Esc back', columns, rows: 5, style: createStyle(level) })
        for (const line of [...panel, ...frame]) {
          expect(displayWidth(line)).toBeLessThanOrEqual(columns)
          // An unbalanced attribute would tint the next row.
          if (line.includes('\u001B[')) expect(line.endsWith('\u001B[0m')).toBe(true)
        }
      }
    }
  })
})
