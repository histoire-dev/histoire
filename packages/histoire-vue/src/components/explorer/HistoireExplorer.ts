import { defineComponent, h } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext } from '../../provider/context.js'
import { HistoireSearch } from '../search/HistoireSearch.js'
import { HistoireToolbar } from '../toolbar/HistoireToolbar.js'
import { ExplorerNavigation } from './ExplorerNavigation.js'
import { ExplorerPanels } from './ExplorerPanels.js'
import { ExplorerPreview } from './ExplorerPreview.js'

/** Reusable composition consumes explicit provider; host owns URL/title and session. */
export const HistoireExplorer = defineComponent({
  name: 'HistoireExplorer',
  props: {
    showNavigation: { type: Boolean, default: true },
    showSearch: { type: Boolean, default: true },
    showToolbar: { type: Boolean, default: true },
    showPanels: { type: Boolean, default: true },
  },
  emits: ['ready', 'error'],
  setup(props, { slots, emit }) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    /** Parts retain own scoped errors; explorer adds one composition observation. */
    function error(value: unknown): void {
      emit('error', value)
    }
    return () => {
      const context = { session, snapshot: snapshot.value }
      return h('div', { class: 'histoire-explorer' }, [
        props.showNavigation ? (slots.navigation?.(context) ?? h(ExplorerNavigation, { showSearch: props.showSearch, onError: error })) : null,
        h('div', { class: 'histoire-explorer-main' }, [
          !props.showNavigation && props.showSearch ? h(HistoireSearch, { onError: error }) : null,
          props.showToolbar ? (slots.toolbar?.(context) ?? h(HistoireToolbar, { onError: error })) : null,
          h('div', { class: 'histoire-explorer-workspace' }, [
            slots.preview?.(context) ?? h(ExplorerPreview, { onReady: () => emit('ready'), onError: error }),
            props.showPanels ? (slots.panels?.(context) ?? h(ExplorerPanels, { onError: error })) : null,
          ]),
        ]),
      ])
    }
  },
})
