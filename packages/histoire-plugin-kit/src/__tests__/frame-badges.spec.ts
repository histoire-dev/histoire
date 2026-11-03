import { describe, expect, it } from 'vitest'
import { createExtensionHost } from '../index.js'
import { createTestContext, plugin } from './fixtures/host.js'

describe('canvas frame badges', () => {
  it('registers qualified header badges filtered per frame', async () => {
    const context = createTestContext()
    const host = createExtensionHost({
      plugins: [plugin('acme', (api) => {
        api.canvas.addFrameBadge({ id: 'issues', available: frame => frame.frame.target.variantId !== 'hidden', badge: frame => frame.frame.target.variantId.length })
      })],
      services: { context },
    })
    await host.ready
    const frame = (variantId: string) => ({ ...context, frame: { key: variantId, target: { storyId: 'story', variantId } } })
    const [badge] = host.available('canvas.frame-badge', frame('shown'))
    expect(badge).toMatchObject({ id: 'acme:issues', kind: 'canvas.frame-badge' })
    expect(badge.badge(frame('shown'))).toBe(5)
    expect(host.available('canvas.frame-badge', frame('hidden'))).toEqual([])
    await host.dispose()
  })
})
