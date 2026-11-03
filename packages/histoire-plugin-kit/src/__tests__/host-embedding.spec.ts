// @vitest-environment jsdom
import type { FrameScopedContext, PluginChannel, SessionContextSource, SessionFrameActor, TestsService, WorkbenchPluginApi } from '../index.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { createElement, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtensionHost, createSessionContext, createSessionFrameService } from '../index.js'
import { plugin } from './fixtures/host.js'

/** Minimal remote session double: one selected variant, inert catalog. */
function createSession(): SessionContextSource & { select: ReturnType<typeof vi.fn> } {
  const select = vi.fn(async () => {})
  return {
    getSnapshot: () => ({ source: { url: 'https://book.example/', sourceId: 'book', epoch: 'e1', revision: 'r1', mode: 'static' }, selection: { storyId: 'story', variantId: 'one' } }) as never,
    subscribe: () => () => {},
    catalog: { list: async () => [], getStory: async () => ({}) as never, search: async () => [] },
    selection: { select },
    select,
  }
}

/**
 * Inspector context a host builds for one selected variant.
 * @param root Root context.
 * @param variantId Selected variant.
 */
function inspectorContext(root: ReturnType<typeof createSessionContext>, variantId: string): FrameScopedContext {
  const target = { storyId: 'story', variantId }
  return { ...root.context, selection: { target }, frame: { key: getHistoireTargetKey(target), target }, runtime: { getSnapshot: () => ({}) as never, subscribe: () => () => {} } }
}

/** Host installing one plugin tab rendering its variant through the DOM mount contract. */
async function hostWithTab() {
  const root = createSessionContext({ session: createSession() })
  const dispose = vi.fn()
  const host = createExtensionHost({
    plugins: [plugin('acme', (api) => {
      api.inspector.addTab({ id: 'panel', label: 'Panel', icon: 'plug', mount(container, context) {
        const text = container.appendChild(document.createElement('output'))
        text.textContent = context.frame.target.variantId
        return { update: next => void (text.textContent = next.frame.target.variantId), dispose }
      } })
    })],
    services: { context: root.context },
  })
  await host.ready
  return { host, root, dispose }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('embedding hosts', () => {
  it('lets a plain DOM host mount, update and dispose a contributed inspector tab', async () => {
    const { host, root, dispose } = await hostWithTab()
    const container = document.body.appendChild(document.createElement('section'))
    const [tab] = host.available('inspector.tab', inspectorContext(root, 'one'))
    expect(tab.label).toBe('Panel')
    const view = host.mount(tab.id, container, inspectorContext(root, 'one'))
    await view.ready
    const output = container.querySelector('output')
    expect(output?.textContent).toBe('one')
    view.update(inspectorContext(root, 'two'))
    await Promise.resolve()
    expect(container.querySelector('output')).toBe(output)
    expect(output?.textContent).toBe('two')
    await view.dispose()
    expect(dispose).toHaveBeenCalledOnce()
    await host.dispose()
  })

  it('lets a React host mount the same tab through the host API', async () => {
    const { host, root, dispose } = await hostWithTab()
    /** React host component placing every available inspector tab. */
    function Inspector(props: { context: FrameScopedContext }) {
      const container = useRef<HTMLDivElement>(null)
      const view = useRef<ReturnType<typeof host.mount>>()
      useEffect(() => {
        const [tab] = host.available('inspector.tab', props.context)
        view.current = host.mount(tab.id, container.current!, props.context)
        return () => void view.current?.dispose()
      }, [])
      useEffect(() => view.current?.update(props.context), [props.context])
      return createElement('div', { ref: container })
    }
    const element = document.body.appendChild(document.createElement('div'))
    const app = createRoot(element)
    flushSync(() => app.render(createElement(Inspector, { context: inspectorContext(root, 'one') })))
    await vi.waitFor(() => expect(element.querySelector('output')?.textContent).toBe('one'))
    const output = element.querySelector('output')
    flushSync(() => app.render(createElement(Inspector, { context: inspectorContext(root, 'two') })))
    await vi.waitFor(() => expect(output?.textContent).toBe('two'))
    flushSync(() => app.unmount())
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    await host.dispose()
  })

  it('binds plugin channels to session actors and releases them with the plugin', async () => {
    const off = vi.fn()
    const channel: PluginChannel = { post: vi.fn(async () => {}), on: vi.fn(() => off), getDroppedCount: () => 0 }
    let actors: readonly SessionFrameActor[] = []
    const plugins = { frames: () => [{ id: 'acme', apiVersion: 1 }], actors: () => actors, subscribe: () => () => {}, open: vi.fn(() => channel) }
    const session = createSession()
    const root = createSessionContext({ session, frames: createSessionFrameService(plugins) })
    let api!: WorkbenchPluginApi
    const host = createExtensionHost({ plugins: [plugin('acme', value => void (api = value))], services: { context: root.context } })
    await host.ready
    const frame = inspectorContext(root, 'one').frame

    expect(api.context.capabilities.has('frames')).toBe(true)
    // No attached actor yet (data-only or before the frame rendered).
    expect(api.frames.list()).toEqual([])
    expect(() => api.frames.open(frame)).toThrow(expect.objectContaining({ code: 'PREVIEW_NOT_READY' }))

    actors = [{ pluginId: 'acme', actorId: 'old', target: frame.target }, { pluginId: 'acme', actorId: 'new', target: frame.target }]
    expect(api.frames.list().map(ref => [ref.key, ref.actorId])).toEqual([[frame.key, 'old'], [frame.key, 'new']])
    // A plain frame binds to its latest actor; a listed ref binds exactly.
    const opened = api.frames.open(frame)
    expect(plugins.open).toHaveBeenLastCalledWith('acme', { actorId: 'new' })
    api.frames.open(api.frames.list()[0])
    expect(plugins.open).toHaveBeenLastCalledWith('acme', { actorId: 'old' })
    opened.on('pong', () => {})

    await host.dispose()
    expect(off).toHaveBeenCalledOnce()
    await expect(opened.post('ping', 1)).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    expect(channel.post).not.toHaveBeenCalled()
  })

  it('exposes host test runs and releases plugin subscriptions with the plugin', async () => {
    const off = vi.fn()
    const tests: TestsService = { entries: () => [], running: false, canRun: true, progress: null, error: null, runAll: vi.fn(async () => {}), run: vi.fn(async () => {}), subscribe: vi.fn(() => off) }
    expect(createSessionContext({ session: createSession() }).context.capabilities.has('tests')).toBe(false)
    const root = createSessionContext({ session: createSession(), tests })
    let api!: WorkbenchPluginApi
    const host = createExtensionHost({ plugins: [plugin('acme', value => void (api = value))], services: { context: root.context } })
    await host.ready
    expect(api.context.capabilities.has('tests')).toBe(true)
    expect(api.context.tests!.canRun).toBe(true)
    await api.context.tests!.runAll()
    expect(tests.runAll).toHaveBeenCalledOnce()
    api.context.tests!.subscribe(() => {})
    await host.dispose()
    expect(off).toHaveBeenCalledOnce()
  })

  it('selects stories through the session and ignores destinations the host lacks', async () => {
    const session = createSession()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = createSessionContext({ session })
    expect(root.context.source.mode).toBe('remote')
    root.context.navigation.openPane('acme:pane')
    root.context.navigation.openSettings('acme:section')
    expect(warn).toHaveBeenCalledTimes(2)
    await root.context.navigation.selectStory({ storyId: 'story', variantId: 'two' })
    expect(session.select).toHaveBeenCalledWith({ storyId: 'story', variantId: 'two' })
    warn.mockRestore()
  })
})
