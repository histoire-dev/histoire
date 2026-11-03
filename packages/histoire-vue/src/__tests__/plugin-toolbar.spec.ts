import type { VNode } from 'vue'
import type { WorkbenchPluginApi } from '../../../histoire-plugin-kit/src/index.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import CanvasToolbar from '../../../histoire-app/src/app/components/canvas/toolbar/CanvasToolbar.vue'
import ToolbarButton from '../../../histoire-app/src/app/components/canvas/toolbar/ToolbarButton.vue'
import { createCanvasFrames, provideCanvas } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { provideExtensionHost } from '../../../histoire-app/src/app/composables/extensions.js'
import { registerPluginShortcuts } from '../../../histoire-app/src/app/extensions/shortcuts.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { createShortcutRegistry, provideShortcutRegistry } from '../../../histoire-app/src/app/util/shortcuts.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createTestWorkbenchHost, pluginEntry } from '../../../histoire/src/node/__tests__/utils/workbench-extensions.js'
import { toolbarGeometry } from './fixtures/toolbar-geometry.js'

vi.mock('virtual:$histoire-config', () => ({ config: { responsivePresets: [], backgroundPresets: [], theme: {} }, logos: {} }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

/**
 * Real canvas toolbar wired to a workbench extension host whose plugin runs `setup`, with plugin
 * shortcuts mirrored into the workbench shortcut registry.
 * @param setup Plugin setup registering toolbar items.
 * @param arrange Active canvas arrangement.
 * @param slots Optional built-in toolbar controls.
 */
async function fixture(setup: (api: WorkbenchPluginApi) => void, arrange = 'grid', slots: Record<string, () => VNode | null> = {}) {
  const geometry = toolbarGeometry(1000)
  const source = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await session.connect()
  const { workbench } = createTestWorkbenchHost({ plugins: [pluginEntry({ id: 'acme', apiVersion: 1, setup })] })
  await workbench.host.ready
  const canvas = createCanvasStore()
  const frames = createCanvasFrames(canvas)
  const shortcuts = createShortcutRegistry()
  const stopShortcuts = registerPluginShortcuts(workbench, shortcuts, () => {})
  const Host = defineComponent(() => {
    provideCanvas(canvas, frames)
    provideExtensionHost(workbench)
    provideShortcutRegistry(shortcuts)
    return () => h('div', { class: 'toolbar-test-host histoire-canvas-viewport' }, h(CanvasToolbar, { arrange }, slots))
  })
  const wrapper = mount(HistoireProvider, { props: { session }, attachTo: document.body, slots: { default: () => h(Host) } })
  await geometry.flush()
  /** Unmounts the toolbar and releases host and session. */
  async function close() {
    wrapper.unmount()
    stopShortcuts()
    await workbench.dispose()
    await session.dispose()
  }
  return { geometry, workbench, close }
}

/**
 * Native toolbar button by accessible name, inline or teleported into the overflow menu.
 * @param label Accessible name.
 */
function button(label: string): HTMLButtonElement {
  const value = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!value) throw new Error(`Missing toolbar action: ${label}`)
  return value
}

/** Accessible action order within a toolbar or open overflow menu. */
function actionLabels(container: Element): (string | null)[] {
  return [...container.querySelectorAll('button[aria-label]')]
    .filter(element => !element.closest('[hidden]'))
    .map(element => element.getAttribute('aria-label'))
}

describe('plugin toolbar items', () => {
  it('keeps Show inspector last through plugin registration, overflow and inspector visibility changes', async () => {
    const inspectorOpen = ref(false)
    const run = vi.fn()
    let api!: WorkbenchPluginApi
    const test = await fixture((plugin) => {
      api = plugin
      // Register out of toolbar order so contribution insertion cannot determine action order.
      api.toolbar.addItem({ id: 'extra', group: 'plugins', type: 'action', label: 'Plugin extra', icon: 'help', run })
      api.toolbar.addItem({ id: 'ui', group: 'ui', type: 'action', label: 'Plugin UI', icon: 'help', run })
      api.toolbar.addItem({ id: 'inspector', group: 'inspector', type: 'action', label: 'Plugin inspector', icon: 'help', run })
      api.toolbar.addItem({ id: 'fallback', group: 'unknown' as 'plugins', type: 'action', label: 'Fallback', icon: 'help', run })
    }, 'grid', {
      inspector: () => inspectorOpen.value ? null : h(ToolbarButton, { label: 'Show inspector', icon: 'side-panel-open', onClick: () => inspectorOpen.value = true }),
      ui: () => h(ToolbarButton, { label: 'Hide UI', icon: 'screen-off' }),
    })
    const expected = ['Plugin inspector', 'Hide UI', 'Plugin UI', 'Plugin extra', 'Fallback', 'Show inspector']
    try {
      const toolbar = document.querySelector('[role="toolbar"][aria-label="Canvas tools"]')!
      expect(actionLabels(toolbar).slice(-expected.length)).toEqual(expected)

      test.geometry.resize(40)
      await test.geometry.flush()
      button('More canvas tools').click()
      await test.geometry.flush()
      const menu = document.querySelector('[role="menu"][aria-label="More canvas tools"]')!
      expect(actionLabels(menu).slice(-expected.length)).toEqual(expected)

      api.toolbar.addItem({ id: 'late', group: 'plugins', type: 'action', label: 'Late plugin', icon: 'help', run })
      await test.geometry.flush()
      expect(actionLabels(menu).slice(-3)).toEqual(['Fallback', 'Late plugin', 'Show inspector'])

      button('Show inspector').click()
      await test.geometry.flush()
      expect(inspectorOpen.value).toBe(true)
      expect(document.querySelector('button[aria-label="Show inspector"]')).toBeNull()
      button('More canvas tools').click()
      await test.geometry.flush()
      button('Late plugin').click()
      await test.geometry.flush()
      expect(run).toHaveBeenCalledTimes(1)

      inspectorOpen.value = false
      test.geometry.resize(1000)
      await test.geometry.flush()
      expect(actionLabels(toolbar).slice(-3)).toEqual(['Fallback', 'Late plugin', 'Show inspector'])
    }
    finally { await test.close() }
  })

  it.each(['grid', 'acme:compare'])('keeps Show inspector last without plugin buttons in %s view', async (arrange) => {
    const test = await fixture((api) => {
      api.canvas.addView({ id: 'compare', label: 'Compare', icon: 'compare', toolbar: ['tools'], mount: () => {} })
    }, arrange, {
      inspector: () => h(ToolbarButton, { label: 'Show inspector', icon: 'side-panel-open' }),
      ui: () => h(ToolbarButton, { label: 'Hide UI', icon: 'screen-off' }),
    })
    try {
      const toolbar = document.querySelector('[role="toolbar"][aria-label="Canvas tools"]')!
      expect(actionLabels(toolbar).at(-1)).toBe('Show inspector')
      expect(actionLabels(toolbar).includes('Hide UI')).toBe(arrange === 'grid')
    }
    finally { await test.close() }
  })

  it('run once against the root context after moving to the overflow menu', async () => {
    const run = vi.fn()
    const test = await fixture((api) => {
      api.toolbar.addItem({ id: 'snap', group: 'zoom', type: 'action', label: 'Snap', icon: 'grid', run })
      api.toolbar.addItem({ id: 'stray', group: 'unknown' as 'plugins', type: 'action', label: 'Stray', icon: 'help', run: () => {} })
    })
    try {
      test.geometry.resize(40)
      await test.geometry.flush()
      button('More canvas tools').click()
      await test.geometry.flush()
      expect(button('Snap').getAttribute('role')).toBe('menuitem')
      expect(button('Stray')).toBeDefined()

      button('Snap').click()
      await test.geometry.flush()

      expect(run).toHaveBeenCalledTimes(1)
      expect(run.mock.calls[0][0].selection.target).toEqual({ storyId: 'a:b', variantId: 'c' })
      expect(button('More canvas tools').getAttribute('aria-expanded')).toBe('false')
    }
    finally { await test.close() }
  })

  it('show the shortcut bound to their command on buttons and popover triggers, and re-read pressed state when the plugin invalidates', async () => {
    let grid = false
    let invalidate!: () => void
    const test = await fixture((api) => {
      invalidate = api.invalidate
      api.commands.add({ id: 'toggle-grid', label: 'Toggle grid', icon: 'grid', run: () => {} })
      api.shortcuts.add({ id: 'toggle-grid-keys', command: 'acme:toggle-grid', keys: ['alt+shift+g'], scope: 'global' })
      api.toolbar.addItem({ id: 'grid', group: 'plugins', type: 'toggle', label: 'Snap grid', icon: 'grid', command: 'acme:toggle-grid', pressed: () => grid, run: () => {} })
      api.toolbar.addItem({ id: 'grid-options', group: 'plugins', type: 'popover', label: 'Grid options', icon: 'settings', command: 'acme:toggle-grid', mount: () => {} })
    })
    try {
      expect(button('Snap grid').title).toBe('Snap grid (Alt ⇧ G)')
      expect(button('Grid options').title).toBe('Grid options (Alt ⇧ G)')
      expect(button('Snap grid').getAttribute('aria-pressed')).toBe('false')

      grid = true
      invalidate()
      await test.geometry.flush()
      expect(button('Snap grid').getAttribute('aria-pressed')).toBe('true')
    }
    finally { await test.close() }
  })

  it('close an open popover and dispose its view when the item is removed', async () => {
    const dispose = vi.fn()
    let remove!: () => void
    const test = await fixture((api) => {
      remove = api.toolbar.addItem({ id: 'layers', group: 'plugins', type: 'popover', label: 'Layers', icon: 'layers', mount(container) {
        container.textContent = 'Layer list'
        return { dispose }
      } })
    })
    try {
      button('Layers').click()
      await test.geometry.flush()
      expect(document.querySelector('[role="dialog"][aria-label="Layers"]')?.textContent).toContain('Layer list')

      remove()
      await test.geometry.flush()

      expect(dispose).toHaveBeenCalledTimes(1)
      expect(document.querySelector('[role="dialog"][aria-label="Layers"]')).toBeNull()
      expect(document.body.textContent).not.toContain('Layer list')
    }
    finally { await test.close() }
  })

  it('list plugin canvas views and show only the groups the active view supports', async () => {
    const test = await fixture((api) => {
      api.canvas.addView({ id: 'compare', label: 'Compare', icon: 'compare', toolbar: ['tools'], mount: () => {} })
      api.toolbar.addItem({ id: 'snap', group: 'zoom', type: 'action', label: 'Snap', icon: 'grid', run: () => {} })
    }, 'acme:compare')
    try {
      expect(button('Compare').getAttribute('aria-pressed')).toBe('true')
      expect(button('Grid')).toBeDefined()
      expect(document.querySelector('button[aria-label="Zoom in"]')).toBeNull()
      expect(document.querySelector('button[aria-label="Snap"]')).toBeNull()
    }
    finally { await test.close() }
  })
})
