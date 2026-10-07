import { describe, expect, it, vi } from 'vitest'

describe('offline workbench icons', () => {
  it('resolves every approved icon with networking unavailable', async () => {
    const fetch = vi.fn(() => {
      throw new Error('Network unavailable')
    })
    vi.stubGlobal('fetch', fetch)
    try {
      const { getHistoireIcon, histoireIconNames } = await import('../../../../histoire-shared/src/icons/index.js')
      expect(histoireIconNames.length).toBeGreaterThan(60)
      for (const name of histoireIconNames) {
        expect(getHistoireIcon(name)?.body, name).toBeTruthy()
        expect(getHistoireIcon(`carbon:${name}`)?.body, name).toBeTruthy()
      }
      expect(getHistoireIcon('not-a-glyph')).toBeUndefined()
      expect(fetch).not.toHaveBeenCalled()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('resolves legacy first-party icon aliases offline', async () => {
    const { getHistoireIcon } = await import('../../../../histoire-shared/src/icons/index.js')
    expect(getHistoireIcon('ri:add-line')).toEqual(getHistoireIcon('add'))
    expect(getHistoireIcon('mdi:drag-vertical-variant')).toEqual(getHistoireIcon('draggable'))
  })

  it('resolves Tailwind logo offline without substituting a generic glyph', async () => {
    const { getHistoireIcon } = await import('../../../../histoire-shared/src/icons/index.js')
    const logo = getHistoireIcon('mdi:tailwind')
    expect(logo?.body).toContain('<path')
    expect(logo).toMatchObject({ width: 24, height: 24 })
    expect(logo).not.toEqual(getHistoireIcon('cube'))
    expect(logo).not.toEqual(getHistoireIcon('color-palette'))
  })
})
