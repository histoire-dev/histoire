import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import { describe, expect, it, vi } from 'vitest'
import { createCanvasReplicaPromotion } from '../../../histoire-app/src/app/components/canvas/frame-promotion.js'

const target = { storyId: 'story', variantId: 'variant' }
const replica = { id: 'frame', ...target, session: {} as HistoireSession }

describe('canvas replica promotion', () => {
  it('tears down canonical primary before selecting retained replica', async () => {
    const calls: string[] = []
    const active = vi.fn()
    const promotion = createCanvasReplicaPromotion({
      detachPrimary: async () => { calls.push('detach') },
      restorePrimary: () => calls.push('restore'),
      select: async value => { calls.push(`select:${value.variantId}`) },
      active,
      error: vi.fn(),
    })

    await promotion.promote(replica)

    expect(calls).toEqual(['detach', 'select:variant'])
    expect(active).toHaveBeenCalledWith(replica)
    expect(promotion.frameId).toBe('frame')
  })

  it('selects paused target before restoring canonical primary', async () => {
    const calls: string[] = []
    const promotion = createCanvasReplicaPromotion({
      detachPrimary: async () => calls.push('detach'),
      restorePrimary: () => calls.push('restore'),
      select: async value => calls.push(`select:${value.variantId}`),
      active: () => {},
      error: vi.fn(),
    })

    await promotion.promote(replica)
    calls.length = 0
    await promotion.selectCanonical({ storyId: 'story', variantId: 'paused' })

    expect(calls).toEqual(['select:paused', 'restore'])
    expect(promotion.frameId).toBeUndefined()
  })

  it('keeps only latest rapid promotion after primary teardown', async () => {
    let release = () => {}
    const detached = new Promise<void>(resolve => release = resolve)
    const selected = vi.fn(async () => {})
    const active = vi.fn()
    const promotion = createCanvasReplicaPromotion({
      detachPrimary: async () => detached,
      restorePrimary: vi.fn(),
      select: selected,
      active,
      error: vi.fn(),
    })

    const replacement = { ...replica, id: 'replacement', variantId: 'replacement' }
    const first = promotion.promote(replica)
    const second = promotion.promote(replacement)
    release()
    await Promise.all([first, second])

    expect(selected).toHaveBeenCalledTimes(1)
    expect(selected).toHaveBeenCalledWith({ storyId: 'story', variantId: 'replacement' })
    expect(active).toHaveBeenCalledWith(replacement)
  })

  it('keeps queued promotion when primary teardown republishes prior target', async () => {
    let release = () => {}
    const detached = new Promise<void>(resolve => release = resolve)
    let current: HistoireTarget = target
    const selected = vi.fn(async (value) => { current = value })
    const promotion = createCanvasReplicaPromotion({
      detachPrimary: async () => detached,
      restorePrimary: vi.fn(),
      select: selected,
      active: () => {},
      current: () => current,
      error: vi.fn(),
    })

    const pending = promotion.promote(replica)
    await Promise.resolve()
    promotion.synchronize(target, false)
    release()
    await pending

    expect(selected).toHaveBeenCalledWith(target)
  })

  it('restores canonical primary after external selection', async () => {
    const restorePrimary = vi.fn()
    const promotion = createCanvasReplicaPromotion({
      detachPrimary: vi.fn(),
      restorePrimary,
      select: vi.fn(),
      active: () => {},
      error: vi.fn(),
    })

    await promotion.promote(replica)
    promotion.synchronize({ storyId: 'story', variantId: 'other' }, false)
    expect(restorePrimary).toHaveBeenCalledTimes(1)
  })

  it('retires pending selection when external target wins', async () => {
    let release = () => {}
    const selected = new Promise<void>(resolve => release = resolve)
    const restorePrimary = vi.fn()
    const error = vi.fn()
    const promotion = createCanvasReplicaPromotion({
      detachPrimary: vi.fn(),
      restorePrimary,
      select: vi.fn(() => selected),
      active: () => {},
      error,
    })

    const pending = promotion.promote(replica)
    await Promise.resolve()
    await Promise.resolve()
    promotion.synchronize({ storyId: 'story', variantId: 'other' }, false)
    release()
    await pending

    expect(restorePrimary).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('restores canonical primary when source becomes stale or Matrix starts', async () => {
    const restorePrimary = vi.fn()
    const promotion = createCanvasReplicaPromotion({
      detachPrimary: vi.fn(),
      restorePrimary,
      select: vi.fn(),
      active: () => {},
      error: vi.fn(),
    })

    await promotion.promote(replica)
    promotion.synchronize(target, true)
    expect(restorePrimary).toHaveBeenCalledTimes(1)

    await promotion.promote(replica)
    // Canvas passes Matrix entry as a forced promotion retirement.
    promotion.synchronize(target, true)
    expect(restorePrimary).toHaveBeenCalledTimes(2)
  })

  it('ignores detached promotion after component close', async () => {
    let release = () => {}
    const detached = new Promise<void>(resolve => release = resolve)
    const selected = vi.fn(async () => {})
    const promotion = createCanvasReplicaPromotion({
      detachPrimary: async () => detached,
      restorePrimary: vi.fn(),
      select: selected,
      active: vi.fn(),
      error: vi.fn(),
    })

    const pending = promotion.promote(replica)
    promotion.close()
    release()
    await pending

    expect(selected).not.toHaveBeenCalled()
  })
})
