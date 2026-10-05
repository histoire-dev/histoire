import type { HistoireMeasureResult } from '@histoire/shared'
import type { MeasureOwner } from '../../../../histoire-app/src/app/components/canvas/measure-controller.js'
import type { CanvasPoint } from '../../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'
import { MEASURE_RESULT } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { createMeasureController } from '../../../../histoire-app/src/app/components/canvas/measure-controller.js'
import { measureResult as result } from './utils/measurement.js'

/** One changing owner drives real controller, keeping reply provenance explicit. */
function fixture() {
  let owner: MeasureOwner | null = { frameId: 'frame', storyId: 'story', variantId: 'variant', documentId: 'document', source: {} as Window, origin: 'https://book.test', generation: 'revision-1' }
  const post = vi.fn((_owner: MeasureOwner, _requestId: string, _point: CanvasPoint) => true)
  const controller = createMeasureController({ getOwner: () => owner, post })
  return { controller, post,
    /** Publish predecessor retirement or another exact runtime owner. */
    setOwner(value: MeasureOwner | null) {
      owner = value
      controller.synchronize()
    },
    /** Read detached identity for replacement tests. */
    owner: () => ({ ...owner! }),
    /** Send currently requested reply unless caller tests a predecessor. */
    reply(value: HistoireMeasureResult | null = result(), overrides: Record<string, unknown> = {}, requestId = post.mock.calls.at(-1)?.[1], transport: Partial<Pick<MessageEvent, 'source' | 'origin'>> = {}) {
      controller.receive({ source: owner?.source, origin: owner?.origin, ...transport, data: { __histoire: true, type: MEASURE_RESULT, requestId, documentId: owner?.documentId, storyId: owner?.storyId, variantId: owner?.variantId, result: value, ...overrides } } as MessageEvent)
    } }
}

describe('canvas measurement lock', () => {
  it('freezes displayed measurement through movement, leave and predecessor replies, then unlocks', () => {
    const { controller, post, reply } = fixture()
    controller.hover({ x: 10, y: 20 })
    reply()
    controller.hover({ x: 70, y: 80 })
    const predecessor = post.mock.calls.at(-1)![1]
    controller.toggle({ x: 70, y: 80 })
    expect(controller.locked.value).toBe(true)
    controller.hover({ x: 90, y: 100 })
    controller.leave()
    reply(result(70), {}, predecessor)
    expect(post).toHaveBeenCalledTimes(2)
    expect(controller.result.value?.rect.x).toBe(10)
    controller.toggle({ x: 90, y: 100 })
    expect(controller.locked.value).toBe(false)
    reply(result(90))
    expect(controller.result.value?.rect.x).toBe(90)
    controller.leave()
    expect(controller.result.value).toBeNull()
  })

  it('locks click point while first response is pending, rejecting previous hover response', () => {
    const { controller, post, reply } = fixture()
    controller.hover({ x: 1, y: 2 })
    const predecessor = post.mock.calls.at(-1)![1]
    controller.toggle({ x: 30, y: 40 })
    expect(post.mock.calls.at(-1)![2]).toEqual({ x: 30, y: 40 })
    controller.leave()
    controller.hover({ x: 50, y: 60 })
    reply(result(1), {}, predecessor)
    expect(controller.result.value).toBeNull()
    reply(result(30))
    expect(controller.locked.value).toBe(true)
    expect(controller.result.value?.rect.x).toBe(30)
  })

  it('never locks empty space and clears pending click when user unlocks before response', () => {
    const { controller, reply } = fixture()
    controller.toggle({ x: 10, y: 20 })
    reply(null)
    expect(controller.locked.value).toBe(false)
    expect(controller.result.value).toBeNull()
    controller.toggle({ x: 10, y: 20 })
    controller.toggle()
    reply()
    expect(controller.locked.value).toBe(false)
    expect(controller.result.value).toBeNull()
  })

  it.each(['frameId', 'storyId', 'variantId', 'documentId', 'generation', 'source'] as const)('clears lock when %s changes and rejects queued predecessor', (key) => {
    const { controller, post, reply, setOwner, owner } = fixture()
    controller.hover({ x: 10, y: 20 })
    reply()
    controller.toggle()
    const predecessor = post.mock.calls.at(-1)![1]
    setOwner({ ...owner(), [key]: key === 'source' ? {} : 'replacement' })
    expect(controller.locked.value).toBe(false)
    expect(controller.result.value).toBeNull()
    reply(result(), {}, predecessor)
    expect(controller.result.value).toBeNull()
  })

  it('clears lock and pending replies when tool or ready preview becomes unavailable', () => {
    const { controller, reply, setOwner } = fixture()
    controller.hover({ x: 10, y: 20 })
    reply()
    controller.toggle()
    setOwner(null)
    reply()
    controller.hover({ x: 30, y: 40 })
    expect(controller.locked.value).toBe(false)
    expect(controller.result.value).toBeNull()
  })

  it('accepts only exact window, origin, tuple, document and newest correlation', () => {
    const { controller, reply } = fixture()
    controller.hover({ x: 10, y: 20 })
    for (const data of [{ documentId: 'old' }, { variantId: 'old' }, { storyId: 'old' }, { requestId: 'old' }, { type: 'other' }, { __histoire: false }]) reply(result(), data)
    reply(result(), {}, undefined, { source: {} as Window })
    reply(result(), {}, undefined, { origin: 'https://foreign.test' })
    reply({ ...result(), rect: { ...result().rect, right: Number.NaN } })
    expect(controller.result.value).toBeNull()
    reply()
    expect(controller.result.value?.rect.x).toBe(10)
  })

  it('never reuses detached controller correlation and ignores replies after close', () => {
    const first = fixture()
    const second = fixture()
    first.controller.hover({ x: 10, y: 20 })
    second.controller.hover({ x: 10, y: 20 })
    expect(first.post.mock.calls[0][1]).not.toBe(second.post.mock.calls[0][1])
    first.controller.close()
    first.reply()
    first.controller.toggle({ x: 10, y: 20 })
    expect(first.controller.result.value).toBeNull()
    expect(first.post).toHaveBeenCalledOnce()
  })

  it('leaves no lock or pending authority when registry cannot address preview', () => {
    const { controller, post, reply } = fixture()
    post.mockReturnValue(false)
    controller.toggle({ x: 10, y: 20 })
    reply()
    expect(controller.locked.value).toBe(false)
    expect(controller.result.value).toBeNull()
  })
})
