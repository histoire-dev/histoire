import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmbedControlsView } from '../../../histoire-app/src/embed/adapters/controls-view.js'
import { deferred } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

const mocks = vi.hoisted(() => ({ unmount: vi.fn(), replica: vi.fn(), tick: undefined as (() => Promise<void>) | undefined }))
vi.mock('vue', async original => ({ ...await original<typeof import('vue')>(), createApp: () => ({ mount: vi.fn(), unmount: mocks.unmount }), nextTick: () => mocks.tick?.() ?? Promise.resolve() }))
vi.mock('../../../histoire-app/src/embed/adapters/controls-replica.js', () => ({ createEmbedControlsReplica: mocks.replica }))

describe('source controls view acquisition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tick = undefined
  })

  it('unwinds mounted Vue app if document aborts while nextTick pending', async () => {
    const tick = deferred<void>()
    mocks.tick = () => tick.promise
    const abort = new AbortController()
    const container = document.createElement('div')
    const creation = createEmbedControlsView({ container, signal: abort.signal } as any)
    void creation.catch(() => {})
    abort.abort()
    expect(mocks.unmount).toHaveBeenCalledOnce()
    expect(container.childElementCount).toBe(0)
    tick.resolve()
    await expect(creation).rejects.toThrow()
    expect(mocks.replica).not.toHaveBeenCalled()
    expect(mocks.unmount).toHaveBeenCalledOnce()
  })

  it('unwinds app if replica factory throws and still removes it when replica close throws', async () => {
    const container = document.createElement('div')
    mocks.replica.mockImplementationOnce(() => {
      throw new Error('replica acquisition failed')
    })
    await expect(createEmbedControlsView({ container, signal: new AbortController().signal } as any)).rejects.toThrow('replica acquisition failed')
    expect(container.childElementCount).toBe(0)
    const close = vi.fn(() => {
      throw new Error('replica close failed')
    })
    mocks.replica.mockReturnValueOnce({ ready: Promise.resolve(), close })
    const view = await createEmbedControlsView({ container, signal: new AbortController().signal } as any)
    expect(() => view.close()).toThrow('replica close failed')
    expect(container.childElementCount).toBe(0)
    expect(mocks.unmount).toHaveBeenCalledTimes(2)
  })
})
