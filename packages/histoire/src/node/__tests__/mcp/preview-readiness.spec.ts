import { runInNewContext } from 'node:vm'
import { SANDBOX_READY, VARIANT_READY } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { createPreviewHostRegistry } from '../../mcp/browser/preview-host.js'
import { renderPreviewScript } from '../../mcp/browser/preview-script.js'
import { matchesPreviewMessage } from '../../mcp/browser/readiness.js'

describe('isolated preview host authority', () => {
  it('requires exact frame, origin, marker, tuple and active nonce/epoch', () => {
    const frame = {}
    const authority = { origin: 'http://localhost:6006', storyId: '..', variantId: 'a:/雪', nonce: 'nonce', epoch: 'epoch', active: true }
    const event = { source: frame, origin: authority.origin, data: { __histoire: true, type: VARIANT_READY, storyId: authority.storyId, variantId: authority.variantId } }
    expect(matchesPreviewMessage(event, frame, authority, { nonce: 'nonce', epoch: 'epoch' })).toBe(true)
    for (const replacement of [{ source: {} }, { origin: 'https://foreign.test' }, { data: { ...event.data, __histoire: false } }, { data: { ...event.data, storyId: '.' } }, { data: { ...event.data, variantId: 'other' } }, { data: { ...event.data, type: 'unknown' } }]) {
      expect(matchesPreviewMessage({ ...event, ...replacement }, frame, authority, { nonce: 'nonce', epoch: 'epoch' })).toBe(false)
    }
    expect(matchesPreviewMessage(event, frame, { ...authority, active: false }, authority)).toBe(false)
    expect(matchesPreviewMessage(event, frame, authority, { nonce: 'old', epoch: 'epoch' })).toBe(false)
    expect(matchesPreviewMessage(event, frame, authority, { nonce: 'nonce', epoch: 'old' })).toBe(false)
    expect(matchesPreviewMessage({ ...event, data: { ...event.data, type: SANDBOX_READY } }, frame, authority, authority)).toBe(true)
  })

  it('renders safe script data and expires exact nonce routes', () => {
    const host = createPreviewHostRegistry({ base: '/book/' })
    let active = true
    const lease = host.open({ origin: 'http://localhost:6006', storyId: '</script><script>bad()</script>\u2028', variantId: '..', epoch: 'epoch', width: 320, height: 240, colorScheme: 'dark', backgroundColor: '#123', textDirection: 'rtl', isActive: () => active })
    const pathname = new URL(lease.url).pathname
    const html = host.render(pathname)
    expect(html).toContain('\\u003c/script>')
    expect(html).not.toContain('<script>bad()')
    expect(pathname.startsWith('/book/__histoire/preview/')).toBe(true)
    expect(host.render(`${pathname}?storyId=other`)).toBeUndefined()
    active = false
    expect(host.render(pathname)).toBeUndefined()
    lease.close()
    expect(host.render(pathname)).toBeUndefined()
    host.close()
  })

  it('rejects off-origin and dot-segment deployment bases', () => {
    for (const base of ['//foreign.test/', 'https://foreign.test/', '/book/../', '/book/%2E%2e/', '/book/?bad', '/book/\\bad']) {
      expect(() => createPreviewHostRegistry({ base })).toThrow('same-origin absolute path')
    }
  })

  it('drops predecessor messages when same iframe WindowProxy hosts a new document', () => {
    const origin = 'http://localhost:6006'
    const listeners = new Map<string, Array<(event: any) => void>>()
    const frame = { style: {}, contentWindow: { __HST_PREVIEW_DOCUMENT_ID__: 'first', postMessage: () => {} } }
    const window: any = { addEventListener(event, listener) {
      const current = listeners.get(event) ?? []
      current.push(listener)
      listeners.set(event, current)
    } }
    const document = { createElement: () => frame, body: { appendChild: () => {} } }
    const script = renderPreviewScript({ authority: { origin, storyId: '..', variantId: '雪', nonce: 'nonce', epoch: 'epoch', active: true }, sandboxUrl: `${origin}/__sandbox.html`, settings: { responsiveWidth: 320, responsiveHeight: 240, rotate: false, backgroundColor: 'transparent', checkerboard: false, textDirection: 'ltr' } })
    runInNewContext(script, { window, document })
    const deliver = (type: string, documentId: string) => listeners.get('message')!.forEach(listener => listener({ origin, source: frame.contentWindow, data: { __histoire: true, type, storyId: '..', variantId: '雪', documentId } }))
    deliver(SANDBOX_READY, 'first')
    deliver(VARIANT_READY, 'first')
    expect(window.__HST_MCP_PREVIEW__.ready).toBe(true)
    frame.contentWindow.__HST_PREVIEW_DOCUMENT_ID__ = 'second'
    deliver(VARIANT_READY, 'second')
    expect(window.__HST_MCP_PREVIEW__.ready).toBe(false)
    deliver(SANDBOX_READY, 'first')
    expect(window.__HST_MCP_PREVIEW__.ready).toBe(false)
    deliver(SANDBOX_READY, 'second')
    expect(window.__HST_MCP_PREVIEW__).toMatchObject({ ready: true, documentId: 'second' })
  })
})
