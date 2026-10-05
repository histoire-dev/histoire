import type { EmbedSurfaceContext, EmbedSurfaceInstance } from '../../../../../histoire-app/src/embed/surfaces.js'
import { describe, expect, it, vi } from 'vitest'
import { createLazyEmbedSurface } from '../../../../../histoire-app/src/embed/adapters/lazy-surface.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'

describe('lazy UI resource ownership', () => {
  it('joins acquisition for finite requests and suppresses reply after close', async () => {
    const acquisition = deferred<EmbedSurfaceInstance>()
    const response = deferred()
    const request = vi.fn(() => response.promise)
    const close = vi.fn()
    const lifetime = new AbortController()
    const surface = createLazyEmbedSurface({ signal: lifetime.signal } as EmbedSurfaceContext, () => acquisition.promise)
    const capture = { signal: lifetime.signal } as Parameters<NonNullable<EmbedSurfaceInstance['request']>>[2]
    const result = surface.request!('state.get', {}, capture)
    expect(request).not.toHaveBeenCalled()
    acquisition.resolve({ ready: Promise.resolve(), request, close })
    await flushMicrotasks()
    expect(request).toHaveBeenCalledWith('state.get', {}, capture)
    const rejection = expect(result).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    await surface.close()
    response.resolve('late')
    await rejection
    expect(close).toHaveBeenCalledOnce()
  })
  it('joins late acquisition and cleanup before releasing ownership without waiting for runtime readiness', async () => {
    const acquisition = deferred<EmbedSurfaceInstance>()
    const cleanup = deferred()
    const runtimeReady = deferred()
    const close = vi.fn(() => cleanup.promise)
    const controller = new AbortController()
    const surface = createLazyEmbedSurface({ signal: controller.signal } as EmbedSurfaceContext, () => acquisition.promise)
    controller.abort()
    let released = false
    const closing = Promise.resolve(surface.close()).then(() => {
      released = true
    })
    const secondClose = surface.close()
    await flushMicrotasks()
    expect(released).toBe(false)
    acquisition.resolve({ ready: runtimeReady.promise, close })
    await flushMicrotasks()
    expect(close).toHaveBeenCalledOnce()
    expect(released).toBe(false)
    cleanup.resolve()
    await Promise.all([closing, secondClose, surface.ready])
    expect(released).toBe(true)
    expect(close).toHaveBeenCalledOnce()
  })

  it('observes failed lazy imports during unmount while retaining original readiness failure', async () => {
    const acquisition = deferred<EmbedSurfaceInstance>()
    const surface = createLazyEmbedSurface({ signal: new AbortController().signal } as EmbedSurfaceContext, () => acquisition.promise)
    const failure = new Error('UI import unavailable')
    const readiness = expect(surface.ready).rejects.toBe(failure)
    const closing = surface.close()
    acquisition.reject(failure)
    await Promise.all([readiness, closing])
  })
})
