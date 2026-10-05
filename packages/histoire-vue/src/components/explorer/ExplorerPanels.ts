import { HstButton } from '@histoire/controls/vue'
import { defineComponent, h, shallowRef, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext } from '../../provider/context.js'
import { useProvidedHistoireTestsModel } from '../../tests/model.js'
import { HistoireControls } from '../controls/HistoireControls.js'
import { HistoireDocs } from '../docs/HistoireDocs.js'
import { HistoireEvents } from '../events/HistoireEvents.js'
import { HistoireSource } from '../source/HistoireSource.js'
import { HistoireTests } from '../tests/HistoireTests.js'

/** Shared independent panels; standalone controls active tab through routing adapter. */
export const ExplorerPanels = defineComponent({
  name: 'HistoireExplorerPanels',
  props: {
    activePanel: { type: String, default: undefined },
    docsAnchor: { type: String, default: '' },
    sourceMode: { type: String, default: 'raw' },
  },
  emits: ['panel', 'error'],
  setup(props, { emit }) {
    const snapshot = useHistoireSnapshot()
    const context = useHistoireContext()
    const tests = useProvidedHistoireTestsModel(context.session)
    const selected = shallowRef('controls')
    // Successful docs search activates this provider's shared panel only.
    // Caller slots/visibility and explicitly controlled standalone routing remain authoritative.
    watch(() => context.panels.docs.value, (intent) => {
      if (intent) selected.value = 'docs'
    }, { immediate: true, flush: 'sync' })
    /** External route owns requested tab; embedded explorer keeps local memory only. */
    function select(value: string): void {
      selected.value = value
      context.panels.clear()
      emit('panel', value)
    }
    return () => {
      const active = props.activePanel ?? selected.value
      const story = snapshot.value.catalog.stories.find(story => story.id === snapshot.value.selection?.storyId)
      const panel = active === 'docs' ? HistoireDocs : active === 'events' ? HistoireEvents : active === 'tests' ? HistoireTests : HistoireControls
      return h('aside', { 'class': 'histoire-explorer-panels', 'aria-label': 'Histoire panels' }, [
        h('div', { class: 'histoire-explorer-tabs', role: 'tablist' }, ['controls', 'docs', 'events', 'tests'].map(value => h(HstButton, { 'color': 'flat', 'type': 'button', 'role': 'tab', 'aria-selected': active === value, 'onClick': () => select(value) }, { default: () => [value[0].toUpperCase() + value.slice(1), value === 'tests' && tests?.state.value.collection ? h('span', { 'aria-label': 'Collected tests' }, ` ${tests.state.value.collection.definitions.length}`) : null] }))),
        h('div', { class: 'histoire-explorer-panel' }, h(panel, { anchor: props.docsAnchor, onError: (error: unknown) => emit('error', error) })),
        story?.content.rawSource ? h(HistoireSource, { mode: props.sourceMode === 'dynamic' ? 'dynamic' : 'raw', onError: (error: unknown) => emit('error', error) }) : null,
      ])
    }
  },
})
