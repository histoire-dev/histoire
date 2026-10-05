import type { HistoireVirtualSlot } from '../../foundation/VirtualList.js'
import { HstButton } from '@histoire/controls/vue'
import { computed, defineComponent, h } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { HistoireDropdown } from '../../foundation/floating.js'
import { HistoireVirtualList } from '../../foundation/VirtualList.js'
import { useHistoireContext } from '../../provider/context.js'

/** Session retains bounded history; this panel preserves current-variant display semantics. */
export const HistoireEvents = defineComponent({
  name: 'HistoireEvents',
  props: {
    /** First-party inspector shows cleaned payload under each event trigger. */
    inlineDetails: { type: Boolean, default: false },
  },
  setup(props) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const items = computed(() => {
      const value = snapshot.value
      return value.events.items.filter(event => event.runtimeId === value.runtime.runtimeId && event.target.storyId === value.selection?.storyId && event.target.variantId === value.selection?.variantId)
    })
    const displayed = computed(() => (props.inlineDetails ? [...items.value].reverse() : items.value).map(event => ({ key: JSON.stringify([event.runtimeId, event.sequence]), event })))
    return () => {
      const value = snapshot.value
      return h('section', { 'class': 'histoire-events', 'aria-label': 'Histoire events' }, [
        props.inlineDetails ? h('span', { class: 'histoire-events-count' }, `${items.value.length} events · newest first`) : null,
        h(HstButton, { color: 'flat', type: 'button', onClick: () => session.events.clear() }, { default: () => props.inlineDetails ? 'Clear' : 'Clear events' }),
        value.events.droppedCount ? h('output', `${value.events.droppedCount} dropped`) : null,
        h(HistoireVirtualList, { items: displayed.value, minItemSize: 72, listTag: 'ol', itemTag: 'li' }, { default: ({ index }: HistoireVirtualSlot) => {
          const event = displayed.value[index].event
          const payload = event.payload as { name?: string, argument?: unknown } | null
          const name = typeof payload?.name === 'string' ? payload.name : 'Event'
          const argument = payload && Object.hasOwn(payload, 'argument') ? payload.argument : event.payload
          return h('div', { class: 'histoire-event-row' }, h(HistoireDropdown, { 'placement': 'right', 'data-test-id': 'event-item' }, {
            default: () => [
              h(HstButton, { color: 'flat', type: 'button' }, { default: () => [name, h('time', { datetime: new Date(event.timestamp).toISOString() }, props.inlineDetails ? new Date(event.timestamp).toLocaleTimeString(undefined, { hour12: false }) : new Date(event.timestamp).toISOString())] }),
              props.inlineDetails ? h('pre', { class: 'histoire-event-argument' }, JSON.stringify(argument, null, 2)) : null,
            ],
            popper: () => h('pre', JSON.stringify(argument, null, 2)),
          }))
        } }),
      ])
    }
  },
})
