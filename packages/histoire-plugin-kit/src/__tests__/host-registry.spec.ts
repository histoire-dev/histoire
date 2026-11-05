import type { WorkbenchPluginApi } from '../index.js'
import { describe, expect, it, vi } from 'vitest'
import { addCommand, commandPlugin, createMemoryStorage, createTestContext, createTestHost, deferred, ids, plugin } from './fixtures/host.js'

describe('extension host ordering', () => {
  it('orders built-ins first, then order, config order and registration order', async () => {
    const gate = deferred()
    const host = createTestHost([
      // Commits last, still sorts by config position.
      plugin('slow', async (api) => {
        await gate.promise
        addCommand(api, 'a')
      }),
      commandPlugin('fast', ['b', 'c']),
      commandPlugin('early', ['d'], { order: -1 }),
    ])
    host.registerBuiltin({ kind: 'command', id: 'search', label: 'Search', icon: 'search', run: () => {} })
    host.registerBuiltin({ kind: 'command', id: 'theme', label: 'Theme', icon: 'moon', run: () => {} })
    gate.resolve()
    await host.ready
    expect(ids(host)).toEqual(['builtin:search', 'builtin:theme', 'early:d', 'slow:a', 'fast:b', 'fast:c'])
  })

  it('keeps built-ins reserved and unique', () => {
    const host = createTestHost([])
    const remove = host.registerBuiltin({ kind: 'command', id: 'search', label: 'Search', icon: 'search', run: () => {} })
    expect(host.contributions('command')[0]).toMatchObject({ id: 'builtin:search', pluginId: 'builtin' })
    expect(() => host.registerBuiltin({ kind: 'command', id: 'search', label: 'Again', icon: 'search', run: () => {} })).toThrow(/builtin:search/)
    remove()
    expect(ids(host)).toEqual([])
  })

  it('returns stable snapshot arrays until a commit changes the kind', async () => {
    let api!: WorkbenchPluginApi
    const host = createTestHost([plugin('acme', (pluginApi) => {
      api = pluginApi
      addCommand(pluginApi, 'run')
    })])
    await host.ready
    const commands = host.contributions('command')
    const tabs = host.contributions('inspector.tab')
    expect(host.contributions('command')).toBe(commands)
    expect(Object.isFrozen(commands)).toBe(true)
    addCommand(api, 'more')
    expect(host.contributions('command')).not.toBe(commands)
    expect(host.contributions('inspector.tab')).toBe(tabs)
  })
})

describe('extension host availability', () => {
  it('filters by availability predicates and notifies on context changes', async () => {
    let enabled = false
    const host = createTestHost([plugin('acme', (api) => {
      addCommand(api, 'always')
      addCommand(api, 'gated', { available: () => enabled })
    })])
    await host.ready
    const listener = vi.fn()
    host.subscribe(listener)
    expect(host.available('command', host.context).map(entry => entry.id)).toEqual(['acme:always'])
    enabled = true
    host.context.notify()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(host.available('command', host.context).map(entry => entry.id)).toEqual(['acme:always', 'acme:gated'])
  })

  it('hides devOnly contributions outside dev sources', async () => {
    const host = createTestHost([plugin('acme', api => addCommand(api, 'debug', { devOnly: true }))])
    await host.ready
    expect(host.available('command', host.context)).toHaveLength(1)
    host.context.source.mode = 'static'
    expect(host.available('command', host.context)).toHaveLength(0)
  })

  it('treats a throwing predicate as unavailable and reports it once', async () => {
    const error = new Error('predicate failed')
    const host = createTestHost([plugin('acme', api => addCommand(api, 'run', { available: () => {
      throw error
    } }))])
    await host.ready
    expect(host.available('command', host.context)).toEqual([])
    expect(host.available('command', host.context)).toEqual([])
    expect(host.diagnostics()).toEqual([{ pluginId: 'acme', contributionId: 'acme:run', phase: 'callback', error }])
  })

  it('notifies host subscribers when a plugin invalidates its state, until the plugin retires', async () => {
    let api!: WorkbenchPluginApi
    const host = createTestHost([plugin('acme', value => void (api = value))])
    await host.ready
    const listener = vi.fn()
    host.subscribe(listener)
    api.invalidate()
    expect(listener).toHaveBeenCalledTimes(1)
    await host.dispose()
    expect(() => api.invalidate()).not.toThrow()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('extension host isolation', () => {
  it('keeps registries, preferences and diagnostics separate between hosts', async () => {
    const definitions = [
      plugin('acme', (api) => {
        addCommand(api, 'run')
        api.preferences.set('count', api.preferences.get('count', 0) + 1)
        api.reportError(new Error('reported'))
      }),
    ]
    const first = createTestHost(definitions)
    const second = createTestHost(definitions)
    await Promise.all([first.ready, second.ready])
    await first.dispose()
    expect(ids(first)).toEqual([])
    expect(ids(second)).toEqual(['acme:run'])
    expect(second.diagnostics()).toHaveLength(1)
    // Memory fallback is per host: each host counted from zero.
    let count: unknown
    const probe = createTestHost([plugin('acme', api => void (count = api.preferences.get('count', 0)))])
    await probe.ready
    expect(count).toBe(0)
  })

  it('namespaces shared storage per project and plugin', async () => {
    const storage = createMemoryStorage()
    const definitions = [
      plugin('acme', api => api.preferences.set('mode', 'dark')),
      plugin('other', api => api.preferences.set('mode', 'light')),
    ]
    const host = createTestHost(definitions, { storage, storageNamespace: 'project-a', context: createTestContext() })
    await host.ready
    expect(Object.fromEntries(storage.entries)).toEqual({
      'project-a:plugin:acme:mode': '"dark"',
      'project-a:plugin:other:mode': '"light"',
    })
  })
})

// Real plugin registration must normalize command ownership before publishing surfaces.
describe('pane and tab primary commands', () => {
  it('qualifies local command ids and retains an explicit same-plugin id', async () => {
    const host = createTestHost([plugin('acme', (api) => {
      api.shell.addPane({ id: 'results', label: 'Results', icon: 'document', primaryCommand: 'run', mount: () => {} })
      api.inspector.addTab({ id: 'audit', label: 'Audit', icon: 'document', primaryCommand: 'acme:run', mount: () => {} })
      addCommand(api, 'run')
    })])
    try {
      await host.ready
      expect(host.diagnostics()).toEqual([])
      expect(host.contributions('shell.pane')[0]).toMatchObject({ id: 'acme:results', primaryCommand: 'acme:run' })
      expect(host.contributions('inspector.tab')[0]).toMatchObject({ id: 'acme:audit', primaryCommand: 'acme:run' })
    }
    finally { await host.dispose() }
  })

  describe.each(['pane', 'tab'] as const)('%s command validation', (surface) => {
    it.each(['foreign:run', 'builtin:run', '', 'bad id', 'acme:bad:id', 'acme:'])('rejects primary command %j through registration diagnostics', async (primaryCommand) => {
      const host = createTestHost([plugin('acme', (api) => {
        const input = { id: 'results', label: 'Results', icon: 'document', primaryCommand, mount: () => {} }
        if (surface === 'pane') api.shell.addPane(input)
        else api.inspector.addTab(input)
      })])
      try {
        await host.ready
        expect(host.contributions(surface === 'pane' ? 'shell.pane' : 'inspector.tab')).toEqual([])
        expect(host.diagnostics()).toEqual(expect.arrayContaining([expect.objectContaining({ pluginId: 'acme', phase: 'register', error: expect.any(Error) })]))
      }
      finally { await host.dispose() }
    })
  })
})
