/**
 * Compile-time contract fixtures, checked by `tsc -p tsconfig.test.json` (never executed).
 * Every `@ts-expect-error` proves an invalid shape is rejected.
 */
import type { CanvasScopedContext, ExtensionHost, FrameScopedContext, WorkbenchContext } from '../../index.js'
import { expectTypeOf } from 'vitest'
import { defineFramePlugin, defineWorkbenchPlugin } from '../../index.js'
import { reactView } from '../../react/index.js'
import { svelte4View } from '../../svelte4/index.js'
import { svelte5View } from '../../svelte5/index.js'

defineWorkbenchPlugin({
  id: 'acme',
  apiVersion: 1,
  setup(api) {
    expectTypeOf(api.contribute({ kind: 'command', id: 'run', label: 'Run', icon: 'play', run: () => {} })).toEqualTypeOf<() => void>()
    // @ts-expect-error unknown contribution kind
    api.contribute({ kind: 'inspector.panel', id: 'x', label: 'X', icon: 'x', mount: () => {} })

    api.inspector.addTab({ id: 'a11y', label: 'A11y', icon: 'accessibility', mount: (_container, context, host) => {
      expectTypeOf(context).toEqualTypeOf<FrameScopedContext>()
      expectTypeOf(host.signal).toEqualTypeOf<AbortSignal>()
      return { update: next => expectTypeOf(next).toEqualTypeOf<FrameScopedContext>() }
    } })
    // @ts-expect-error view contributions need `component` or `mount`
    api.inspector.addTab({ id: 'a11y', label: 'A11y', icon: 'accessibility' })
    // @ts-expect-error `component` and `mount` are exclusive
    api.shell.addPane({ id: 'pane', label: 'Pane', icon: 'x', component: {}, mount: () => {} })
    api.inspector.addSection({ id: 'hint', tab: 'builtin:props', position: 'after', component: {} })
    // @ts-expect-error section tabs must be qualified
    api.inspector.addSection({ id: 'hint', tab: 'props', position: 'after', component: {} })

    // @ts-expect-error actions need `run`
    api.commands.add({ id: 'run', label: 'Run', icon: 'play' })
    // @ts-expect-error frame menu actions need `run`
    api.menus.addFrameAction({ id: 'measure', label: 'Measure', icon: 'ruler' })
    api.menus.addFrameAction({ id: 'measure', label: 'Measure', icon: 'ruler', run: (context, { signal }) => {
      expectTypeOf(context.frame.target.storyId).toEqualTypeOf<string>()
      expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
    } })
    api.menus.addContextAction({ id: 'copy', targets: ['story', 'frame'], label: 'Copy', run: (context) => {
      expectTypeOf(context.target.kind).toBeString()
    } })

    api.toolbar.addItem({ id: 'grid', group: 'plugins', type: 'toggle', label: 'Grid', icon: 'grid', pressed: () => true, run: () => {} })
    // @ts-expect-error toggles need `pressed`
    api.toolbar.addItem({ id: 'grid', group: 'plugins', type: 'toggle', label: 'Grid', icon: 'grid', run: () => {} })
    // @ts-expect-error unknown toolbar group
    api.toolbar.addItem({ id: 'grid', group: 'nope', type: 'action', label: 'Grid', icon: 'grid', run: () => {} })
    api.toolbar.addItem({ id: 'panel', group: 'zoom', type: 'popover', label: 'Panel', icon: 'x', ...reactView<WorkbenchContext>(() => null) })

    api.canvas.addView({ id: 'stack', label: 'Stack', icon: 'layers', ...svelte5View<CanvasScopedContext>(() => ({})) })
    api.shell.addPane({ id: 'svelte4', label: 'Svelte 4', icon: 'x', ...svelte4View<WorkbenchContext>(class {
      constructor(options: { props?: { context: WorkbenchContext } }) {
        expectTypeOf(options.props!.context).toEqualTypeOf<WorkbenchContext>()
      }

      $set() {}
      $destroy() {}
    }) })
    // @ts-expect-error React view props carry the surface context type
    api.shell.addPane({ id: 'react', label: 'React', icon: 'x', ...reactView<WorkbenchContext>((props: { context: CanvasScopedContext }) => null) })
    // @ts-expect-error canvas view mounts receive canvas-scoped context, not frame-scoped context
    api.canvas.addView({ id: 'stack', label: 'Stack', icon: 'layers', mount: (_container, _context: FrameScopedContext) => {} })
    api.home.addSection({ id: 'news', column: 'primary', title: 'News', component: {} })
    api.canvas.addFrameBadge({ id: 'count', badge: (context) => {
      expectTypeOf(context.frame.target.storyId).toBeString()
      return { text: 2, tone: 'danger', label: '2 issues' }
    } })
    // @ts-expect-error header badges run for frames without a live runtime
    api.canvas.addFrameBadge({ id: 'count', badge: context => context.runtime.getSnapshot() ? 1 : 0 })
    // @ts-expect-error unknown badge tone
    api.canvas.addFrameBadge({ id: 'count', badge: () => ({ text: 1, tone: 'loud' }) })
  },
})

// @ts-expect-error only apiVersion 1 exists
defineWorkbenchPlugin({ id: 'acme', apiVersion: 2, setup() {} })
// @ts-expect-error frame definitions need `attach`
defineFramePlugin({ id: 'acme', apiVersion: 1 })
defineFramePlugin({ id: 'acme', apiVersion: 1, attach: frame => frame.channel.on('ping', (_data, message) => expectTypeOf(message.actorId).toBeString()) })

declare const host: ExtensionHost
const [tab] = host.contributions('inspector.tab')
expectTypeOf(tab.label).toBeString()
expectTypeOf(tab.pluginId).toBeString()
