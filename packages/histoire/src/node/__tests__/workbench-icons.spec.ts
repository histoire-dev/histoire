import { describe, expect, it, vi } from 'vitest'

describe('offline workbench icons', () => {
  it('resolves every approved icon with networking unavailable', async () => {
    const fetch = vi.fn(() => {
      throw new Error('Network unavailable')
    })
    vi.stubGlobal('fetch', fetch)
    try {
      const { getWorkbenchIcon, workbenchIconNames } = await import('../../../../histoire-app/src/app/util/icons.js')
      expect(workbenchIconNames.length).toBeGreaterThan(60)
      for (const name of workbenchIconNames) {
        expect(getWorkbenchIcon(name)?.body, name).toBeTruthy()
        expect(getWorkbenchIcon(`carbon:${name}`)?.body, name).toBeTruthy()
      }
      expect(getWorkbenchIcon('not-a-glyph')).toBeUndefined()
      expect(fetch).not.toHaveBeenCalled()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('resolves legacy first-party icon aliases offline', async () => {
    const { getWorkbenchIcon } = await import('../../../../histoire-app/src/app/util/icons.js')
    expect(getWorkbenchIcon('ri:add-line')).toEqual(getWorkbenchIcon('add'))
    expect(getWorkbenchIcon('mdi:drag-vertical-variant')).toEqual(getWorkbenchIcon('draggable'))
  })
})
