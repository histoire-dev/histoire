/* eslint-disable no-control-regex -- asserts on escape sequences */
import { describe, expect, it } from 'vitest'
import { renderBanner } from '../terminal/banner.js'
import { displayWidth } from '../terminal/width.js'

describe('startup banner', () => {
  it('fits every width at every color level and closes its styling', () => {
    for (const color of [0, 1, 2, 3] as const) {
      for (const columns of [120, 40, 28, 20, 12]) {
        const lines = renderBanner({ version: '1.2.3', columns, color, url: 'http://localhost:6006/' })
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(columns)
          // Color never bleeds into following output.
          if (line.includes('\u001B[')) expect(line.endsWith('\u001B[0m')).toBe(true)
        }
      }
    }
  })

  it('drops the art when too narrow and keeps the version', () => {
    const wide = renderBanner({ version: '1.2.3', columns: 80, color: false })
    const narrow = renderBanner({ version: '1.2.3', columns: 18, color: false })
    expect(wide.length).toBeGreaterThan(1)
    expect(narrow).toEqual(['Histoire v1.2.3'])
  })

  it('emits no escape sequence without color', () => {
    expect(renderBanner({ version: '1.2.3', columns: 80, color: false, url: 'http://localhost:6006/' }).join('\n')).not.toMatch(/\u001B/)
  })

  it('shows the address beside the art once known', () => {
    expect(renderBanner({ version: '1.2.3', columns: 80, color: false, url: 'http://localhost:6006/' }).join('\n')).toContain('Local  http://localhost:6006/')
  })
})
