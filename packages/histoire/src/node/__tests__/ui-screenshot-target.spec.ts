import type { ViteDevServer } from 'vite'
import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
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
    expect(options.host.open(options.target).url).toContain('/book/__histoire/preview/')
    expect(() => resolveUiScreenshotTarget(context, server, active, 'epoch', request, { ...target, variantId: 'missing' })).toThrow('target unavailable')
    expect(() => resolveUiScreenshotTarget(context, server, () => false, 'epoch', request, target)).toThrow('target unavailable')
    expect(() => resolveUiScreenshotTarget(context, server, active, 'epoch', { ...request, background: 'url(secret)' }, target)).toThrow('background unavailable')
  })
})
