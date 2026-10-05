import { defineComponent, h } from 'vue'
import { HistoireSearch } from '../search/HistoireSearch.js'
import { HistoireStoryTree } from '../tree/HistoireStoryTree.js'

/** Shared catalog navigation; standalone adapter may add its header through slot. */
export const ExplorerNavigation = defineComponent({
  name: 'HistoireExplorerNavigation',
  props: { showSearch: { type: Boolean, default: true } },
  emits: ['select', 'error'],
  setup(props, { emit }) {
    return () => h('aside', { class: 'histoire-explorer-navigation' }, [
      props.showSearch ? h(HistoireSearch, { onSelect: value => emit('select', value), onError: error => emit('error', error) }) : null,
      h(HistoireStoryTree, { onSelect: value => emit('select', value), onError: error => emit('error', error) }),
    ])
  },
})
