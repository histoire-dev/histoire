import type { MountApi, StoryOptions } from '../../vanilla-support/types.js'
import type { TailwindSnapshot, TailwindTokenCategory } from '../types.js'
import { HstCopyIcon, HstNumber, HstText, HstTextarea, HstTokenGrid, HstTokenList, useControlsTheme } from '../../../vendors/controls.js'
import { createApp, h } from '../../../vendors/vue.js'
import { renderTokenSample, tailwindSampleCss } from './render.js'

/** Initialize primitive values once; host-provided iframe state remains authoritative. */
export function initializeTailwindState(state: Record<string, any>) {
  state.search ??= ''
  state.sampleText ??= 'The quick brown fox jumps over the lazy dog.'
  state.fontSize ??= 16
}

/** Mount over variant-owned state; onUpdate also supports nonreactive vanilla callers. */
function mount(api: MountApi, render: () => any, canvas = false) {
  initializeTailwindState(api.state)
  const app = createApp({
    setup() {
      const dark = useControlsTheme()
      return () => canvas
        ? h('section', { 'class': 'histoire-wrapper histoire-tailwind-book', 'data-histoire-control-appearance': dark.value ? 'dark' : 'light', 'style': { background: 'var(--histoire-control-resolved-surface)', minHeight: '100vh', padding: '1px' } }, render())
        : render()
    },
  })
  const instance = app.mount(api.el)
  api.onUpdate(() => instance.$forceUpdate())
  api.onUnmount(() => app.unmount())
}

/** Shared filter and meaningful typography controls, synchronized by existing state protocol. */
function controls(category: TailwindTokenCategory, state: Record<string, any>) {
  const fields = [h(HstText, { 'title': 'Filter tokens', 'modelValue': state.search, 'onUpdate:modelValue': (value) => {
    state.search = value
  } })]
  if (category.kind === 'text' || category.kind === 'text-color') {
    fields.push(h(HstTextarea, { 'title': 'Sample text', 'modelValue': state.sampleText, 'onUpdate:modelValue': (value) => {
      state.sampleText = value
    }, 'rows': 3 }))
    if (category.id !== 'font-size') {
      fields.push(h(HstNumber, { 'title': 'Font size', 'modelValue': state.fontSize, 'onUpdate:modelValue': (value) => {
        state.fontSize = value
      }, 'min': 1 }))
    }
  }
  return fields
}

/** Generate compatible vanilla story while keeping immutable theme data separate from state. */
export function createTailwindStory(snapshot: TailwindSnapshot, EmptyState: any): StoryOptions {
  return {
    id: snapshot.source.id,
    title: snapshot.source.title,
    group: 'design-system',
    icon: 'carbon:color-palette',
    responsiveDisabled: true,
    layout: { type: 'single', iframe: true },
    variants: [
      ...snapshot.categories.map(category => ({
        id: category.id,
        title: category.title,
        icon: category.kind.startsWith('text') ? 'carbon:text-font' : 'carbon:color-palette',
        onMount(api: MountApi) {
          mount(api, () => {
            const byKey = new Map(category.tokens.map(token => [token.key, token]))
            const component = ['text', 'padding', 'margin', 'width', 'height', 'value'].includes(category.kind) ? HstTokenList : HstTokenGrid
            return h('div', { 'data-tailwind-source': snapshot.source.id }, [
              h('style', tailwindSampleCss),
              h(component, {
                tokens: Object.fromEntries(category.tokens.map(token => [token.key, token.value])),
                getName: key => byKey.get(key)!.name,
                search: api.state.search,
              }, {
                default: ({ token }) => {
                  const entry = byKey.get(token.key)!
                  return [
                    renderTokenSample(category, entry, api.state),
                    entry.cssVariable
                      ? h('div', { class: 'htw-flex htw-items-center htw-gap-1 htw-min-w-0' }, [
                          h('code', { class: 'htw-truncate' }, entry.cssVariable),
                          h(HstCopyIcon, { content: entry.cssVariable, label: 'Copy CSS variable' }),
                        ])
                      : null,
                  ]
                },
                empty: () => h(EmptyState, { icon: 'search', title: 'No matching tokens' }),
              }),
            ])
          }, true)
        },
        onMountControls(api: MountApi) { mount(api, () => controls(category, api.state)) },
      })),
      {
        id: 'full-config',
        title: 'Full Config',
        icon: 'carbon:code',
        onMount(api: MountApi) { mount(api, () => h('pre', { style: { margin: '16px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(snapshot.config, null, 2)), true) },
      },
    ],
  }
}
