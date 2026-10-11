import type { ViteDevServer } from 'vite'
import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { closeContext } from '../context.js'
import { getContextScreenshotSetup } from '../runtime/registry.js'
import { resolveUiScreenshotTarget } from '../server/ui-channel/screenshot.js'
import { createMcpPreviewHtmlMiddleware } from '../vite/mcp-preview-html.js'

describe('uI capture appearance parity', () => {
  it('passes CSS viewport, device scale, globals, theme, and transparent checker to MCP preview host', () => {
    const context = {
      root: '/project',
      storyFiles: [{ story: { id: 'story', variants: [{ id: 'variant' }] } }],
      config: { preview: { globals: { locale: 'fr' } }, theme: { defaultColorScheme: 'dark' }, backgroundPresets: [{ color: '#fff' }] },
    } as unknown as Context
    const server = { config: { base: '/book/' }, middlewares: {}, resolvedUrls: { local: ['http://127.0.0.1:6006/book/'] } } as unknown as ViteDevServer
    createMcpPreviewHtmlMiddleware(server)
    const target = { storyId: 'story', variantId: 'variant', frameKey: 'displayed-cell', propsOverride: { enabled: true, emphasized: false } }
    const request = { requestId: 'capture', targets: [target], viewport: { width: 1024, height: 640 }, scale: 3 as const, format: 'png' as const, background: '$checkerboard' }
    const active = () => true
    const options = resolveUiScreenshotTarget(context, server, active, 'epoch', request, target)
    expect(options.target).toEqual({ origin: 'http://127.0.0.1:6006', ...target, epoch: 'epoch', width: 1024, height: 640, deviceScaleFactor: 3, globals: { locale: 'fr' }, colorScheme: 'dark', textDirection: 'ltr', backgroundColor: 'transparent', isActive: active })
    expect(resolveUiScreenshotTarget(context, server, active, 'epoch', { ...request, background: '$checkerboard-dark' }, target).target.backgroundColor).toBe('transparent')
    expect(options.host.open(options.target).url).toContain('/book/__histoire/preview/')
    expect(() => resolveUiScreenshotTarget(context, server, active, 'epoch', request, { ...target, variantId: 'missing' })).toThrow('target unavailable')
    expect(() => resolveUiScreenshotTarget(context, server, () => false, 'epoch', request, target)).toThrow('target unavailable')
    expect(() => resolveUiScreenshotTarget(context, server, active, 'epoch', { ...request, background: 'url(secret)' }, target)).toThrow('background unavailable')
  })

  it('shares one lazy owner for repeated UI target resolution without launching setup', async () => {
    const context = {
      root: '/project',
      storyFiles: [{ story: { id: 'story', variants: [{ id: 'variant' }] } }],
      config: { browser: { source: 'executable', executablePath: './bin/chrome' }, preview: {}, theme: { defaultColorScheme: 'light' }, backgroundPresets: [] },
    } as unknown as Context
    const server = { config: { base: '/' }, middlewares: {}, resolvedUrls: { local: ['http://127.0.0.1:6006/'] } } as unknown as ViteDevServer
    createMcpPreviewHtmlMiddleware(server)
    const target = { storyId: 'story', variantId: 'variant' }
    const request = { requestId: 'capture', targets: [target], viewport: { width: 480, height: 320 }, scale: 1 as const, format: 'png' as const, background: 'transparent' }
    const active = () => true

    try {
      const first = resolveUiScreenshotTarget(context, server, active, 'epoch', request, target)
      const second = resolveUiScreenshotTarget(context, server, active, 'epoch', request, target)

      expect(first.setupOwner).toBe(second.setupOwner)
      expect(first.setupOwner).toBe(getContextScreenshotSetup(context))
      expect(first.setupOwner.getSnapshot()).toEqual({ revision: 0, state: 'unverified', attempts: [], repairs: [] })
    }
    finally {
      await closeContext(context)
    }
  })
})
