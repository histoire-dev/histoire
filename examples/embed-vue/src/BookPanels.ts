import type { HistoireSession } from '@histoire/sdk'
import type { PropType } from 'vue'
import { HstText } from '@histoire/controls/vue'
import { HistoireControls, HistoireDocs, HistoireEvents, HistoirePreview, HistoireProvider, HistoireSearch, HistoireSource, HistoireStoryTree, HistoireTests, HistoireToolbar, HistoireVariantGrid } from '@histoire/vue'
import { defineComponent, h, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'

/** Public primary wrapper exposes confirmed teardown before another primary can mount. */
interface PrimaryHandle {
  /** Join resource cleanup, including source runtime retirement. */
  unmount: () => Promise<void>
}

/** Native parts share provided session; host Vue owns their reactivity and DOM. */
export const BookPanels = defineComponent({
  props: {
    /** Caller-owned connected controller. */
    session: { type: Object as PropType<HistoireSession>, required: true },
    /** Initial view, independent of another provider's presentation. */
    initialGrid: Boolean,
  },
  emits: ['error'],
  setup(props, { emit }) {
    const grid = ref(props.initialGrid)
    const shown = ref(true)
    const switching = ref(false)
    const primary = shallowRef<PrimaryHandle | null>(null)
    const hostControl = ref('Peer Vue')
    let removed = false
    onBeforeUnmount(() => removed = true)
    /** Teardown completes before Vue renders replacement primary; no automatic retry. */
    async function switchView() {
      if (switching.value) return
      switching.value = true
      try {
        await primary.value?.unmount()
        if (removed) return
        shown.value = false
        await nextTick()
        if (removed) return
        grid.value = !grid.value
        shown.value = true
      }
      catch (error) { emit('error', error) }
      finally { switching.value = false }
    }
    return () => h(HistoireProvider, { session: props.session, class: 'book', onError: (error: unknown) => emit('error', error) }, {
      default: () => h('div', { class: 'book-content' }, [
        h(HstText, { 'title': 'Host Vue control', 'aria-label': 'Host Vue control', 'modelValue': hostControl.value, 'onUpdate:modelValue': (value: string) => hostControl.value = value }),
        h('output', hostControl.value),
        h(HistoireToolbar),
        h('div', { class: 'book-layout' }, [
          h('aside', [h(HistoireSearch), h(HistoireStoryTree)]),
          h('div', [
            h('button', { disabled: switching.value, onClick: () => void switchView() }, grid.value ? 'Show single preview' : 'Show variant grid'),
            shown.value ? h(grid.value ? HistoireVariantGrid : HistoirePreview, { ref: primary, class: 'preview' }) : null,
            h(HistoireControls),
            h(HistoireDocs),
            h(HistoireSource),
            h(HistoireEvents),
            h(HistoireTests),
          ]),
        ]),
      ]),
    })
  },
})
