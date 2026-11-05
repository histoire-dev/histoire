import type { Disposer, WorkbenchPluginApi } from '../../../histoire-plugin-kit/src/index.js'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { defineWorkbenchPlugin } from '../../../histoire-plugin-kit/src/index.js'
import { deferred } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { pluginEntry } from '../../../histoire/src/node/__tests__/utils/workbench-extensions.js'
import { FrameProbe, storyInspectorFixture } from './fixtures/story-inspector.js'

/**
 * Plugin `acme` whose setup runs `setup`.
 * @param setup Registers inspector contributions.
 */
function acme(setup: (api: WorkbenchPluginApi) => void) {
  return defineWorkbenchPlugin({ id: 'acme', apiVersion: 1, setup })
}

/** Adds the `acme:panel` tab rendering the frame probe. */
function addPanel(api: WorkbenchPluginApi, extra: { available?: (context: any) => boolean, badge?: () => number } = {}): Disposer {
  return api.inspector.addTab({ id: 'panel', label: 'Acme', icon: 'plug', component: FrameProbe, ...extra })
}

describe('inspector extensions', () => {
  it('moves Docs after plugin tabs when documentation is absent and restores its position when available', async () => {
    const fixture = await storyInspectorFixture({ plugins: [pluginEntry(acme(api => addPanel(api)))] })
    await fixture.selectFrame('c')
    expect(fixture.tabList()).toEqual(['*Props', 'Docs', 'Events', 'Tests', 'Acme'])

    fixture.source.descriptor.catalog.stories[0].content.docs = false
    fixture.source.emitCatalog()
    await flushPromises()
    expect(fixture.tabList()).toEqual(['*Props', 'Events', 'Tests', 'Acme', 'Docs'])
    await fixture.inspector().get('[role="tablist"]').trigger('keydown', { key: 'End' })
    await flushPromises()
    expect(fixture.panels[0]).toEqual(['docs'])
    await vi.waitFor(() => expect(fixture.inspector().get('[role="tabpanel"]').text()).toContain('No documentation'))

    fixture.source.descriptor.catalog.stories[0].content.docs = true
    fixture.source.emitCatalog()
    await flushPromises()
    expect(fixture.tabList()).toEqual(['Props', '*Docs', 'Events', 'Tests', 'Acme'])
  })

  it('links empty inspector tabs to relevant guides for the selected story', async () => {
    const fixture = await storyInspectorFixture({ plugins: [] })
    await fixture.selectFrame('c')
    fixture.source.descriptor.catalog.stories[0].content.docs = false
    fixture.source.descriptor.catalog.stories[0].supportPluginId = 'svelte4'
    fixture.source.emitCatalog()
    await flushPromises()

    for (const [name, url] of [
      ['Docs', 'https://histoire.dev/guide/svelte3/docs.html'],
      ['Events', 'https://histoire.dev/guide/svelte3/events.html'],
      ['Tests', 'https://histoire.dev/guide/testing.html'],
    ]) {
      const tab = fixture.inspector().findAll('[role="tab"]').find(item => item.text().trim() === name)!
      await tab.trigger('click')
      await vi.waitFor(() => expect(fixture.inspector().get('[role="tabpanel"] a').attributes('href')).toBe(url))
    }

    fixture.source.descriptor.catalog.stories[0].supportPluginId = 'vue3'
    fixture.source.emitCatalog()
    await flushPromises()
    for (const [name, url] of [
      ['Docs', 'https://histoire.dev/guide/vue3/docs.html'],
      ['Events', 'https://histoire.dev/guide/vue3/events.html'],
    ]) {
      const tab = fixture.inspector().findAll('[role="tab"]').find(item => item.text().trim() === name)!
      await tab.trigger('click')
      await vi.waitFor(() => expect(fixture.inspector().get('[role="tabpanel"] a').attributes('href')).toBe(url))
    }
  })

  it('keeps a plugin tab deep link while plugins load, then on reload', async () => {
    const load = deferred<{ default: unknown }>()
    const plugin = acme(api => addPanel(api))
    const first = await storyInspectorFixture({ plugins: [pluginEntry(plugin, () => load.promise)], tabs: ['acme:panel'] })
    await first.selectFrame('c')
    // Before setup settles: a loading state, no fallback and no route rewrite.
    await vi.waitFor(() => expect(first.inspector().get('[role="tabpanel"]').text()).toContain('Loading'))
    expect(first.tabList()).not.toContain('*Props')
    expect(first.panels[0]).toEqual([])

    load.resolve({ default: plugin })
    await first.workbench.host.ready
    await flushPromises()
    expect(first.tabList()).toContain('*Acme')
    expect(first.inspector().get('[role="tabpanel"]').text()).toBe('c:0')
    expect(first.panels[0]).toEqual([])

    const reloaded = await storyInspectorFixture({ plugins: [pluginEntry(plugin)], tabs: ['acme:panel'] })
    await reloaded.selectFrame('c')
    await reloaded.workbench.host.ready
    await flushPromises()
    expect(reloaded.tabList()).toContain('*Acme')
    expect(reloaded.panels[0]).toEqual([])
  })

  it('keeps legacy tab values and appends plugin tabs to keyboard navigation', async () => {
    const fixture = await storyInspectorFixture({ plugins: [pluginEntry(acme(api => addPanel(api, { badge: () => 3 })))], tabs: ['events'] })
    await fixture.selectFrame('c')
    expect(fixture.tabList()).toEqual(['Props', 'Docs', '*Events', 'Tests', 'Acme 3'])
    await fixture.inspector().get('[role="tablist"]').trigger('keydown', { key: 'End' })
    await flushPromises()
    expect(fixture.panels[0]).toEqual(['acme:panel'])
    expect(document.activeElement?.textContent).toContain('Acme')
    await fixture.inspector().get('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(fixture.panels[0]).toEqual(['acme:panel', ''])
  })

  it('re-reads plugin tab badges when the plugin invalidates its state', async () => {
    let count = 1
    let invalidate!: () => void
    const fixture = await storyInspectorFixture({ plugins: [pluginEntry(acme((api) => {
      invalidate = api.invalidate
      addPanel(api, { badge: () => count })
    }))] })
    await fixture.selectFrame('c')
    expect(fixture.tabList()).toContain('Acme 1')

    count = 4
    invalidate()
    await flushPromises()
    expect(fixture.tabList()).toContain('Acme 4')
  })

  it('falls back to Props and restores focus when the active plugin tab is removed', async () => {
    let remove!: Disposer
    const fixture = await storyInspectorFixture({ plugins: [pluginEntry(acme((api) => {
      remove = addPanel(api)
    }))], tabs: ['acme:panel'] })
    await fixture.selectFrame('c')
    await fixture.workbench.host.ready
    await flushPromises()
    ;(fixture.inspector().get('[role="tab"][aria-selected="true"]').element as HTMLElement).focus()

    remove()
    await flushPromises()
    expect(fixture.panels[0]).toEqual([''])
    expect(fixture.tabList()).toEqual(['*Props', 'Docs', 'Events', 'Tests'])
    expect(document.activeElement?.textContent?.trim()).toBe('Props')
  })

  it('hides an unavailable plugin tab and falls back like a removal', async () => {
    const fixture = await storyInspectorFixture({ plugins: [pluginEntry(acme(api => addPanel(api, { available: context => context.frame.target.variantId === 'c' })))], tabs: ['acme:panel'] })
    await fixture.selectFrame('c')
    await fixture.workbench.host.ready
    await flushPromises()
    expect(fixture.tabList()).toContain('*Acme')

    await fixture.selectFrame('other')
    expect(fixture.tabList()).toEqual(['*Props', 'Docs', 'Events', 'Tests'])
    expect(fixture.panels[0]).toEqual([''])
  })

  it('places sections around the active tab and footer before Source, following the selected frame', async () => {
    const fixture = await storyInspectorFixture({ plugins: [pluginEntry(acme((api) => {
      api.inspector.addSection({ id: 'before', tab: 'builtin:props', position: 'before', component: FrameProbe })
      api.inspector.addSection({ id: 'after', tab: 'builtin:props', position: 'after', component: FrameProbe })
      api.inspector.addSection({ id: 'docs', tab: 'builtin:docs', position: 'before', component: FrameProbe })
      api.inspector.addSection({ id: 'footer', tab: 'footer', position: 'after', component: FrameProbe })
    }))] })
    await fixture.selectFrame('c')
    await fixture.workbench.host.ready
    await flushPromises()
    const order = [...fixture.inspector().element.querySelectorAll('[data-histoire-contribution]:not([role="tab"], [role="menuitem"]), [data-test-id="story-controls"], .inspector-source')]
      .map(element => element.getAttribute('data-histoire-contribution') ?? element.getAttribute('data-test-id') ?? 'source')
    expect(order).toEqual(['acme:before', 'story-controls', 'acme:after', 'acme:footer', 'source'])

    await fixture.inspector().get('[data-histoire-contribution="acme:before"] button').trigger('click')
    await fixture.selectFrame('other')
    expect(fixture.inspector().get('[data-histoire-contribution="acme:before"]').text()).toBe('other:1')
    expect(fixture.inspector().get('[data-histoire-contribution="acme:footer"]').text()).toBe('other:0')
  })

  it('keeps independent active state and unique ARIA ids across inspectors', async () => {
    const fixture = await storyInspectorFixture({ plugins: [pluginEntry(acme(api => addPanel(api)))], tabs: ['acme:panel', 'acme:missing'] })
    await fixture.selectFrame('c')
    await fixture.workbench.host.ready
    await flushPromises()
    await nextTick()
    expect(fixture.tabList(0)).toContain('*Acme')
    expect(fixture.tabList(1)).toContain('*Props')
    expect(fixture.panels).toEqual([[], ['']])

    const ids = [...fixture.wrapper.element.querySelectorAll('[id]')].map(element => element.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const index of [0, 1]) {
      const panel = fixture.inspector(index).get('[role="tabpanel"]')
      const tab = fixture.inspector(index).get(`[role="tab"][aria-controls="${panel.attributes('id')}"]`)
      expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'))
    }
  })
})
