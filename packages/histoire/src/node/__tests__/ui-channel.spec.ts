import { describe, expect, it, vi } from 'vitest'
import { assertUiPayload, uiScreenshotSchema } from '../server/ui-channel/validation.js'
import { uiChannelFixture } from './utils/ui-channel.js'

describe('bounded dev UI channel', () => {
  it('rejects oversized and malformed capture envelopes before running feature work', () => {
    expect(() => assertUiPayload({ text: '界'.repeat(24_000) })).toThrow('64 KB')
    expect(() => uiScreenshotSchema.parse({ requestId: 'capture', targets: [] })).toThrow()
    expect(() => uiScreenshotSchema.parse({ requestId: 'capture', targets: [{ storyId: 'story', variantId: 'variant' }], viewport: { width: 480, height: 320 }, scale: 4, format: 'png', background: 'transparent' })).toThrow()
  })

  it('admits exact matrix cell snapshots but rejects runtime metadata and oversized props', () => {
    const request = { requestId: 'capture', targets: [{ storyId: 'story', variantId: 'variant', frameKey: 'cell', propsOverride: { enabled: true, message: 'Cell rendering' } }], viewport: { width: 480, height: 320 }, scale: 1, format: 'png', background: 'transparent' }
    expect(uiScreenshotSchema.parse(request)).toEqual(request)
    for (const propsOverride of [{ _hPropState: {} }, { message: '界'.repeat(6000) }, { invalid: Number.NaN }]) {
      expect(uiScreenshotSchema.safeParse({ ...request, targets: [{ ...request.targets[0], propsOverride }] }).success).toBe(false)
    }
  })

  it('isolates client replies and removes owned listeners before cleanup', async () => {
    const { handlers, ws, client, channel } = uiChannelFixture()
    const run = vi.fn((value, sender) => channel.send('histoire:ui:result', value, sender))
    channel.on('histoire:ui:request', value => value, run)
    await handlers.get('histoire:ui:request')!({ requestId: 'one' }, client)
    expect(client.send).toHaveBeenCalledWith('histoire:ui:result', { requestId: 'one' })
    expect(ws.send).not.toHaveBeenCalled()
    const cleanup = vi.fn(() => expect(handlers.size).toBe(0))
    channel.addCleanup(cleanup)
    channel.onReady(() => {
      throw new Error('Unavailable feature')
    })
    const snapshot = vi.fn()
    channel.onReady(snapshot)
    await handlers.get('histoire:ui:ready')!({}, client)
    expect(snapshot).toHaveBeenCalledWith(client)
    await channel.close()
    await channel.close()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('suppresses stale generation callbacks and publication', async () => {
    let active = true
    const { handlers, ws, channel } = uiChannelFixture(() => active)
    const run = vi.fn()
    channel.on('histoire:ui:request', value => value, run)
    active = false
    await handlers.get('histoire:ui:request')!({}, { send: vi.fn() })
    channel.send('histoire:ui:result', {})
    expect(run).not.toHaveBeenCalled()
    expect(ws.send).not.toHaveBeenCalled()
    await channel.close()
  })
})
