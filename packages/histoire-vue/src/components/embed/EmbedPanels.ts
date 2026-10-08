import type { HistoireEmbedPanel } from '@histoire/protocol'
import type { PropType } from 'vue'
import { HstButton } from '@histoire/controls/vue'
import { defineComponent, h, shallowRef, useId } from 'vue'
import { HistoireControls } from '../controls/HistoireControls.js'
import { HistoireDocs } from '../docs/HistoireDocs.js'
import { HistoireEvents } from '../events/HistoireEvents.js'
import { HistoireSource } from '../source/HistoireSource.js'

/** One active panel shares the scoped canvas session without another primary. */
export const EmbedPanels = defineComponent({
  name: 'HistoireEmbedPanels',
  props: {
    /** Capability-filtered panels in canonical order. */
    panels: { type: Array as PropType<readonly HistoireEmbedPanel[]>, required: true },
  },
  emits: ['error'],
  setup(props, { emit }) {
    const selected = shallowRef<HistoireEmbedPanel>()
    const id = useId()
    /** Forward panel errors through the composition's live boundary. */
    const error = (value: unknown) => emit('error', value)
    return () => {
      const active = selected.value && props.panels.includes(selected.value) ? selected.value : props.panels[0]
      const component = active === 'docs' ? HistoireDocs : active === 'source' ? HistoireSource : active === 'events' ? HistoireEvents : HistoireControls
      return h('aside', { 'class': 'histoire-embed-panels', 'aria-label': 'Embed panels' }, [
        h('div', { 'class': 'histoire-embed-tabs', 'role': 'tablist', 'aria-label': 'Panels' }, props.panels.map(panel => h(HstButton, {
          'id': `${id}-${panel}`,
          'color': 'flat',
          'type': 'button',
          'role': 'tab',
          'aria-selected': panel === active,
          'aria-controls': `${id}-panel`,
          'tabindex': panel === active ? 0 : -1,
          'onClick': () => selected.value = panel,
          'onKeydown': (event: KeyboardEvent) => {
            const index = props.panels.indexOf(panel)
            const next = event.key === 'ArrowRight' ? (index + 1) % props.panels.length : event.key === 'ArrowLeft' ? (index + props.panels.length - 1) % props.panels.length : event.key === 'Home' ? 0 : event.key === 'End' ? props.panels.length - 1 : -1
            if (next < 0) return
            event.preventDefault()
            selected.value = props.panels[next]
            ;(event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[id="${id}-${selected.value}"]`)?.focus()
          },
        }, { default: () => panel[0].toUpperCase() + panel.slice(1) }))),
        h('div', { 'id': `${id}-panel`, 'class': 'histoire-embed-panel', 'role': 'tabpanel', 'aria-labelledby': `${id}-${active}` }, [
          h(component, { key: active, mode: 'raw', storyLinkBehavior: 'open', onError: error }),
        ]),
      ])
    }
  },
})
