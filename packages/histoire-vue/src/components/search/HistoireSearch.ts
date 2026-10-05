import type { HistoireSearchResult } from '@histoire/protocol'
import type { HistoireContentState } from '../../content/controller.js'
import { getControlElement, HstButton, HstText } from '@histoire/controls/vue'
import { defineComponent, h, onMounted, shallowRef, watch } from 'vue'
import { createHistoireContentController } from '../../content/controller.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { useHistoireSearchShortcut } from '../../provider/shortcuts.js'
import { useHistoireSearchNavigation } from '../../search/navigation.js'

/** Independent search reuses source Fuse ranking; superseded queries never render or activate. */
export const HistoireSearch = defineComponent({
  name: 'HistoireSearch',
  emits: ['select', 'query', 'error'],
  setup(_props, { emit, expose }) {
    const context = useHistoireContext()
    const { session } = context
    let active = true
    const input = shallowRef<HTMLInputElement | null>(null)
    const query = shallowRef('')
    const navigation = useHistoireSearchNavigation()
    const state = shallowRef<HistoireContentState<readonly HistoireSearchResult[]>>({ status: 'idle', value: null, error: null })
    const controller = createHistoireContentController(session, () => {
      const value = session.getSnapshot()
      return [query.value, value.source?.epoch, value.source?.revision, value.status, value.stale]
    }, () => query.value.trim() ? session.catalog.search(query.value) : Promise.resolve(null), (value) => {
      state.value = value
      navigation.setResults(value.status === 'ready' ? (value.value ?? []).map(result => () => select(result)) : [])
    })
    useHistoireResource(() => {
      active = false
      controller.close()
    })
    useHistoireSearchShortcut(input)
    onMounted(() => void controller.start())
    watch(query, () => {
      emit('query', query.value)
      void controller.refresh()
    }, { flush: 'sync' })
    expose({ focus: () => input.value?.focus(), search: (value: string) => query.value = value })
    /** Portable result activates session only; host URLs/titles remain caller-owned. */
    function select(result: HistoireSearchResult) {
      const source = session.getSnapshot().source
      void session.selection.select(result.target).then(() => {
        // SDK acknowledgment can settle before another observer replaces source
        // or target. Both local panel intent and emitted activation share guard.
        if (!active || !context.panels.showDocs(result, source)) return
        emit('select', result)
      }).catch((error) => {
        if (active) emit('error', error)
      })
    }
    /** Result navigation remains scoped to this input, preserving unrelated host shortcuts. */
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        query.value = ''
        return
      }
      navigation.keydown(event)
    }
    return () => h('section', { 'class': 'histoire-search', 'aria-label': 'Histoire search', 'aria-busy': state.value.status === 'loading' }, [
      h(HstText, { 'layout': 'inline', 'ref': (value: any) => { input.value = getControlElement(value) as HTMLInputElement | null }, 'type': 'search', 'aria-label': 'Search stories and docs', 'modelValue': query.value, 'onUpdate:modelValue': (value: string) => query.value = value, 'onKeydown': keydown }),
      state.value.error ? h('p', { role: 'alert' }, (state.value.error as Error).message ?? String(state.value.error)) : null,
      state.value.status === 'ready' && !state.value.value?.length ? h('output', 'No matches') : null,
      h('ul', (state.value.value ?? []).map((result, index) => h('li', { key: JSON.stringify([result.target.storyId, result.target.variantId, result.kind]) }, h(HstButton, { 'color': 'flat', 'type': 'button', 'aria-current': navigation.isActive(index) ? 'true' : undefined, 'onFocus': () => navigation.focus(index), 'onClick': () => select(result) }, { default: () => [result.title, result.excerpt ? h('small', result.excerpt) : null] })))),
    ])
  },
})
