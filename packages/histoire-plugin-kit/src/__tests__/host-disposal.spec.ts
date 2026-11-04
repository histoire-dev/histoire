import type { WorkbenchPluginApi } from '../index.js'
import { describe, expect, it, vi } from 'vitest'
import { addCommand, createTestContext, createTestHost, deferred, ids, plugin } from './fixtures/host.js'

describe('extension host disposal', () => {
  it('prevents late registration and disposes late setup results after disposal', async () => {
    const gate = deferred()
    const lateDisposer = vi.fn()
    let signal!: AbortSignal
    const host = createTestHost([plugin('acme', async (api) => {
      signal = api.signal
      addCommand(api, 'early')
      await gate.promise
      addCommand(api, 'late')
      return lateDisposer
    })])
    const listener = vi.fn()
    host.subscribe(listener)
    await host.dispose()
    expect(signal.aborted).toBe(true)
    gate.resolve()
    // Disposal does not wait for hanging setups.
    await host.ready
    await new Promise(resolve => setTimeout(resolve))
    expect(ids(host)).toEqual([])
    expect(lateDisposer).toHaveBeenCalledTimes(1)
    expect(listener).not.toHaveBeenCalled()
    expect(host.diagnostics()).toEqual([])
  })

  it('releases each resource once under reentrant and repeated disposal', async () => {
    const pluginDisposer = vi.fn()
    let api!: WorkbenchPluginApi
    const host = createTestHost([plugin('acme', (pluginApi) => {
      api = pluginApi
      const removeCommand = addCommand(pluginApi, 'run')
      return () => {
        pluginDisposer()
        // Reentrant teardown from inside a plugin disposer.
        removeCommand()
        void host.dispose()
      }
    })])
    await host.ready
    await Promise.all([host.dispose(), host.dispose()])
    await host.dispose()
    expect(pluginDisposer).toHaveBeenCalledTimes(1)
    expect(ids(host)).toEqual([])
    expect(host.context.listenerCount).toBe(0)
    // Registration after disposal is a no-op.
    addCommand(api, 'zombie')()
    expect(ids(host)).toEqual([])
  })

  it('releases plugin-owned context subscriptions on disposal', async () => {
    const host = createTestHost([plugin('acme', (api) => {
      api.context.subscribe(() => {})
    })])
    await host.ready
    await host.dispose()
    expect(host.context.listenerCount).toBe(0)
  })

  it('releases plugin-owned catalog subscriptions on disposal and refuses later ones', async () => {
    const context = createTestContext()
    const catalogListeners = new Set<() => void>()
    context.catalog = { list: async () => [], getStory: async () => ({}) as never, search: async () => [], subscribe: (listener) => {
      catalogListeners.add(listener)
      return () => void catalogListeners.delete(listener)
    } }
    let api!: WorkbenchPluginApi
    const host = createTestHost([plugin('acme', (value) => {
      api = value
      value.context.catalog.subscribe!(() => {})
    })], { context })
    await host.ready
    expect(catalogListeners.size).toBe(1)
    await host.dispose()
    expect(catalogListeners.size).toBe(0)
    api.context.catalog.subscribe!(() => {})
    expect(catalogListeners.size).toBe(0)
  })

  it('records plugin disposer failures and keeps tearing down', async () => {
    const error = new Error('dispose failed')
    const otherDisposer = vi.fn()
    const host = createTestHost([
      plugin('first', () => otherDisposer),
      plugin('second', () => () => {
        throw error
      }),
    ])
    await host.ready
    await host.dispose()
    expect(otherDisposer).toHaveBeenCalledTimes(1)
    expect(host.diagnostics()).toEqual([{ pluginId: 'second', phase: 'dispose', error }])
  })
})

describe('extension host actions', () => {
  it('runs an action with captured context and an abort signal', async () => {
    const run = vi.fn()
    const host = createTestHost([plugin('acme', api => addCommand(api, 'run', { run }))])
    await host.ready
    const context = { captured: true }
    await host.run('acme:run', context)
    expect(run).toHaveBeenCalledWith(context, { signal: expect.any(AbortSignal) })
  })

  it('discards the result of an action pending during disposal', async () => {
    const gate = deferred()
    let signal!: AbortSignal
    const host = createTestHost([plugin('acme', api => addCommand(api, 'run', { run: async (_context, options) => {
      signal = options.signal
      await gate.promise
    } }))])
    await host.ready
    const running = host.run('acme:run', {})
    await host.dispose()
    expect(signal.aborted).toBe(true)
    gate.reject(new Error('late failure'))
    await expect(running).resolves.toBeUndefined()
    expect(host.diagnostics()).toEqual([])
  })

  it('aborts when the caller scope retires', async () => {
    const gate = deferred()
    const host = createTestHost([plugin('acme', api => addCommand(api, 'run', { run: () => gate.promise }))])
    await host.ready
    const scope = new AbortController()
    const running = host.run('acme:run', {}, { signal: scope.signal })
    scope.abort()
    gate.reject(new Error('stale'))
    await expect(running).resolves.toBeUndefined()
    expect(host.diagnostics()).toEqual([])
  })

  it('surfaces action errors to the caller and records them', async () => {
    const error = new Error('action failed')
    const host = createTestHost([plugin('acme', api => addCommand(api, 'run', { run: () => {
      throw error
    } }))])
    await host.ready
    await expect(host.run('acme:run', {})).rejects.toBe(error)
    expect(host.diagnostics()).toEqual([{ pluginId: 'acme', contributionId: 'acme:run', phase: 'run', error }])
  })

  it('rejects unknown and non-action contributions', async () => {
    const host = createTestHost([plugin('acme', (api) => {
      api.shell.addPane({ id: 'pane', label: 'Pane', icon: 'x', mount: () => {} })
    })])
    await host.ready
    await expect(host.run('acme:missing', {})).rejects.toThrow(/acme:missing/)
    await expect(host.run('acme:pane', {})).rejects.toThrow(/acme:pane/)
  })
})
