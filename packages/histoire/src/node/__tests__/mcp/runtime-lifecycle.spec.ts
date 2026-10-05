import type { RuntimeGeneration } from '../../runtime/types.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCleanupStack, RuntimeCleanupError } from '../../runtime/cleanup.js'
import { createProjectRuntimeController } from '../../runtime/controller.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'

/** A runtime whose initial collection may still be pending. */
function generation(ready = Promise.resolve()): RuntimeGeneration {
  return {
    context: { root: '/project' } as any,
    server: { printUrls: vi.fn() } as any,
    ready,
    close: vi.fn(async () => {}),
    collect: vi.fn(async () => {}),
    onCollection: vi.fn(() => () => {}),
  }
}

describe('owned project runtime', () => {
  const controllers: ReturnType<typeof createProjectRuntimeController>[] = []
  afterEach(async () => {
    await Promise.all(controllers.splice(0).map(controller => controller.close()))
  })

  /** Starts an isolated injected runtime without loading project modules. */
  function create(start: () => Promise<RuntimeGeneration>) {
    const controller = createProjectRuntimeController({}, { start, watch: async () => vi.fn(async () => {}) })
    controllers.push(controller)
    return controller
  }

  it('waits for initial collection rather than listening before becoming ready', async () => {
    const collection = deferred<void>()
    const runtime = generation(collection.promise)
    const controller = create(async () => runtime)
    const started = controller.start()
    await flushMicrotasks()
    expect(controller.status).toBe('starting')
    expect(controller.current?.isActive()).toBe(true)
    collection.resolve()
    const handle = await started
    expect(controller.status).toBe('ready')
    expect(handle.context).toBe(runtime.context)
  })

  it('invalidates previous handle before cleanup and coalesces config edits', async () => {
    const cleanup = deferred<void>()
    const old = generation()
    old.close = vi.fn(() => cleanup.promise)
    const start = vi.fn().mockResolvedValueOnce(old).mockResolvedValue(generation())
    const controller = create(start)
    const handle = await controller.start()
    controller.subscribe((status) => {
      if (status === 'restarting') expect(handle.isActive()).toBe(false)
    })
    const restart = controller.restart('Vite')
    const repeated = controller.restart('Histoire')
    expect(handle.isActive()).toBe(false)
    expect(controller.status).toBe('restarting')
    expect(start).toHaveBeenCalledTimes(1)
    cleanup.resolve()
    await Promise.all([restart, repeated])
    expect(start).toHaveBeenCalledTimes(2)
    expect(controller.current?.epoch).not.toBe(handle.epoch)
    expect(old.close).toHaveBeenCalledTimes(1)
  })

  it('invalidates handle before draining server jobs and keeps Vite open until drain confirms', async () => {
    const drain = deferred<void>()
    const runtime = generation()
    const controller = createProjectRuntimeController({
      onBeforeRelease: async (handle) => {
        expect(handle.isActive()).toBe(false)
        expect(runtime.close).not.toHaveBeenCalled()
        await drain.promise
      },
    }, { start: async () => runtime, watch: async () => async () => {} })
    controllers.push(controller)
    await controller.start()
    const closing = controller.close()
    await flushMicrotasks()
    expect(runtime.close).not.toHaveBeenCalled()
    drain.resolve()
    await closing
    expect(runtime.close).toHaveBeenCalledTimes(1)
  })

  it('closes failed initial collection once and settles readiness with its error', async () => {
    const collection = deferred<void>()
    const runtime = generation(collection.promise)
    const controller = create(async () => runtime)
    const started = controller.start()
    const rejected = expect(started).rejects.toThrow('collection failed')
    await flushMicrotasks()
    collection.reject(new Error('collection failed'))
    await rejected
    expect(controller.status).toBe('failed')
    expect(runtime.close).toHaveBeenCalledTimes(1)
    expect(controller.current).toBeUndefined()
  })

  it('suppresses late ready completion after close', async () => {
    const collection = deferred<void>()
    const runtime = generation(collection.promise)
    const controller = create(async () => runtime)
    const started = controller.start()
    const rejected = expect(started).rejects.toThrow('closed')
    await flushMicrotasks()
    const handle = controller.current!
    await controller.close()
    collection.resolve()
    await rejected
    expect(handle.isActive()).toBe(false)
    expect(controller.status).toBe('closed')
    expect(runtime.close).toHaveBeenCalledTimes(1)
    await controller.close()
    expect(runtime.close).toHaveBeenCalledTimes(1)
  })

  it('keeps independently started project owners active until each closes', async () => {
    const first = create(async () => generation())
    const second = create(async () => generation())
    const one = await first.start()
    const two = await second.start()
    expect(one.isActive()).toBe(true)
    expect(two.isActive()).toBe(true)
    await first.close()
    expect(one.isActive()).toBe(false)
    expect(two.isActive()).toBe(true)
  })

  it('closes late acquisition without blocking another project', async () => {
    const acquired = deferred<RuntimeGeneration>()
    const runtime = generation()
    const first = create(() => acquired.promise)
    const second = create(async () => generation())
    const started = first.start()
    const rejected = expect(started).rejects.toThrow('closed')
    const close = first.close()
    const independent = await second.start()
    acquired.resolve(runtime)
    await Promise.all([close, rejected])
    expect(runtime.close).toHaveBeenCalledTimes(1)
    expect(first.current).toBeUndefined()
    expect(independent.isActive()).toBe(true)
  })

  it('does not lose a config edit while next generation initial collection runs', async () => {
    const collection = deferred<void>()
    const start = vi.fn().mockResolvedValueOnce(generation()).mockResolvedValueOnce(generation(collection.promise)).mockResolvedValue(generation())
    const controller = create(start)
    await controller.start()
    const restarted = controller.restart()
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2))
    expect(controller.current).toBeDefined()
    const editedDuringStartup = controller.restart()
    collection.resolve()
    await Promise.all([restarted, editedDuringStartup])
    expect(start).toHaveBeenCalledTimes(3)
    expect(controller.status).toBe('ready')
  })
})

describe('resource cleanup', () => {
  it('cannot restart again after unconfirmed server job teardown', async () => {
    vi.resetModules()
    const { createProjectRuntimeController: createIsolated } = await import('../../runtime/controller.js')
    const start = vi.fn(async () => generation())
    const first = createIsolated({ onBeforeRelease: () => {
      throw new Error('runner teardown unconfirmed')
    } }, { start, watch: async () => async () => {} })
    await first.start()
    await expect(first.restart()).rejects.toThrow('runner teardown unconfirmed')
    await expect(first.restart()).rejects.toThrow('runner teardown unconfirmed')
    await expect(first.start()).rejects.toThrow('runner teardown unconfirmed')
    expect(start).toHaveBeenCalledTimes(1)
    await expect(first.close()).rejects.toThrow('runner teardown unconfirmed')
  })
  it('quarantines failed teardown to its controller while other projects can start', async () => {
    vi.resetModules()
    const { createProjectRuntimeController: createIsolated } = await import('../../runtime/controller.js')
    const failure = new RuntimeCleanupError([new Error('acquisition failed'), new Error('server close failed')], 'acquisition failed')
    const first = createIsolated({}, { start: async () => {
      throw failure
    } })
    const second = createIsolated({}, { start: async () => generation() })
    await expect(first.start()).rejects.toThrow('acquisition failed')
    expect(first.status).toBe('failed')
    const independent = await second.start()
    expect(independent.isActive()).toBe(true)
    await expect(first.close()).rejects.toThrow('acquisition failed')
    await second.close()
  })
  it('waits for dependent plugin cleanup before closing its server', async () => {
    const cleanup = createCleanupStack()
    const pluginFinished = deferred<void>()
    let serverOpen = true
    cleanup.add(() => {
      serverOpen = false
    })
    cleanup.add(async () => {
      expect(serverOpen).toBe(true)
      await pluginFinished.promise
      expect(serverOpen).toBe(true)
    })
    const closing = cleanup.close()
    await flushMicrotasks()
    expect(serverOpen).toBe(true)
    pluginFinished.resolve()
    await closing
    expect(serverOpen).toBe(false)
  })
  it('unwinds every acquired resource even when one close fails, once', async () => {
    const cleanup = createCleanupStack()
    const events: string[] = []
    cleanup.add(() => {
      events.push('first')
    })
    cleanup.add(() => {
      events.push('second')
      throw new Error('close failed')
    })
    cleanup.add(() => {
      events.push('third')
    })
    await expect(cleanup.close()).rejects.toThrow('close failed')
    await expect(cleanup.close()).rejects.toThrow('close failed')
    expect(events).toEqual(['third', 'second', 'first'])
  })
})
