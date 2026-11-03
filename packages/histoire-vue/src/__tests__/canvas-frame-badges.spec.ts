import { describe, expect, it, vi } from 'vitest'
import { evaluateFrameBadges } from '../../../histoire-app/src/app/components/canvas/frame-badges.js'

/** Host double listing the given badges as available. */
function host(badges: Array<{ id: string, badge: () => unknown }>) {
  return { available: vi.fn(() => badges), reportViewError: vi.fn() }
}

describe('canvas frame header badges', () => {
  it('normalizes values, hides empty ones and drops throwing badges for good', () => {
    const failed = new WeakSet<object>()
    const broken = { id: 'acme:broken', badge: () => {
      throw new Error('boom')
    } }
    const fake = host([
      { id: 'acme:count', badge: () => 3 },
      { id: 'acme:rich', badge: () => ({ text: 2, tone: 'danger', label: '2 accessibility violations' }) },
      { id: 'acme:empty', badge: () => '' },
      { id: 'acme:none', badge: () => null },
      broken,
    ])
    const context = {} as never

    expect(evaluateFrameBadges(fake as never, context, failed)).toEqual([
      { id: 'acme:count', text: '3', tone: 'neutral', label: undefined },
      { id: 'acme:rich', text: '2', tone: 'danger', label: '2 accessibility violations' },
    ])
    expect(fake.reportViewError).toHaveBeenCalledWith('acme:broken', expect.any(Error), 'update')
    evaluateFrameBadges(fake as never, context, failed)
    expect(fake.reportViewError).toHaveBeenCalledOnce()
  })

  it('falls back to the neutral tone for unknown tones', () => {
    const fake = host([{ id: 'acme:odd', badge: () => ({ text: 'new', tone: 'loud' }) }])
    expect(evaluateFrameBadges(fake as never, {} as never, new WeakSet())).toEqual([{ id: 'acme:odd', text: 'new', tone: 'neutral', label: undefined }])
  })
})
