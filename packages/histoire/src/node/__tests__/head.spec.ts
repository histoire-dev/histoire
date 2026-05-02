import { describe, expect, it } from 'vitest'
import { applyHeadTransform } from '../util/head.js'

const BASE_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>'

describe('applyHeadTransform', () => {
  it('returns the html untouched when head is undefined', async () => {
    expect(await applyHeadTransform(BASE_HTML, undefined)).toBe(BASE_HTML)
  })

  it('injects user-supplied link tags into the head', async () => {
    const out = await applyHeadTransform(BASE_HTML, {
      link: [{ rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    })
    expect(out).toContain('<link rel="preconnect" href="https://fonts.googleapis.com">')
  })

  it('injects user-supplied meta tags into the head', async () => {
    const out = await applyHeadTransform(BASE_HTML, {
      meta: [{ name: 'theme-color', content: '#10b981' }],
    })
    expect(out).toContain('<meta name="theme-color" content="#10b981">')
  })

  it('skips unhead default lang and viewport tags when head is provided', async () => {
    const out = await applyHeadTransform(BASE_HTML, {
      meta: [{ name: 'theme-color', content: '#10b981' }],
    })
    expect(out).not.toContain('lang="en"')
    expect(out).not.toMatch(/<meta[^>]*name="viewport"/)
  })
})
