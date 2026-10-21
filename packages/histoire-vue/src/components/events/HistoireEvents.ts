import type { HistoireEvent } from '@histoire/protocol'
import type { HistoireVirtualListHandle, HistoireVirtualSlot } from '../../foundation/VirtualList.js'
import { HstButton } from '@histoire/controls/vue'
import { computed, defineComponent, h, nextTick, onUpdated, ref, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { HistoireDropdown } from '../../foundation/floating.js'
import { HistoireVirtualList } from '../../foundation/VirtualList.js'
import { useHistoireContext } from '../../provider/context.js'

/** Session retains bounded history; this panel preserves current-variant display semantics. */
export const HistoireEvents = defineComponent({
  name: 'HistoireEvents',
  props: {
    /** First-party inspector shows cleaned payload directly in each event card. */
    inlineDetails: { type: Boolean, default: false },
  },
  setup(props) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const list = ref<HistoireVirtualListHandle>()
    // Field computeds keep identity across unrelated publications (settings, layout, ...),
    // so the list and its virtual scroller only update when events or their owner change.
    const runtimeId = computed(() => snapshot.value.runtime.runtimeId)
    const storyId = computed(() => snapshot.value.selection?.storyId)
    const variantId = computed(() => snapshot.value.selection?.variantId)
    const history = computed(() => snapshot.value.events.items)
    const droppedCount = computed(() => snapshot.value.events.droppedCount)
    const owner = computed(() => JSON.stringify([runtimeId.value, storyId.value, variantId.value]))
    const items = computed<readonly HistoireEvent[]>((previous) => {
      const next = history.value.filter(event => event.runtimeId === runtimeId.value && event.target.storyId === storyId.value && event.target.variantId === variantId.value)
      // Events of other variants/runtimes replace history without changing this panel's rows.
      return previous && previous.length === next.length && previous.every((event, index) => event === next[index]) ? previous : next
    })
    const displayed = computed(() => (props.inlineDetails ? [...items.value].reverse() : items.value).map(event => ({ key: JSON.stringify([event.runtimeId, event.sequence]), event })))
    let afterRender: (() => void) | undefined
    onUpdated(() => afterRender?.())
    watch([() => props.inlineDetails, owner, () => items.value.at(-1)?.sequence], async ([inline, target, newest], [wasInline, previousTarget, previous], onCleanup) => {
      if (!inline || !wasInline || target !== previousTarget || newest === undefined || newest === previous) return
      // Decide before prepending: measured scroller restores old row's position on update.
      const offset = list.value?.getScrollTop()
      if (offset === undefined || offset > 80) return
      let cancelled = false
      let renderedOffset: number | undefined
      afterRender = () => renderedOffset = list.value?.getScrollTop()
      onCleanup(() => {
        cancelled = true
        afterRender = undefined
      })
      await nextTick()
      // Clear, target/mode changes and retirement cannot scroll another publication.
      if (cancelled || !props.inlineDetails || owner.value !== target || items.value.at(-1)?.sequence !== newest) return
      const current = list.value?.getScrollTop()
      // Allow library's own row anchoring, but honor scrolling after DOM publication.
      if (current === undefined || (current > 80 && current !== renderedOffset)) return
      list.value?.scrollToTop()
      afterRender = undefined
    })
    return () => {
      return h('section', { 'class': 'histoire-events', 'aria-label': 'Histoire events' }, [
        props.inlineDetails ? h('span', { class: 'histoire-events-count' }, `${items.value.length} events · newest first`) : null,
        h(HstButton, { color: 'flat', type: 'button', onClick: () => session.events.clear() }, { default: () => props.inlineDetails ? 'Clear' : 'Clear events' }),
        droppedCount.value ? h('output', `${droppedCount.value} dropped`) : null,
        h(HistoireVirtualList, { ref: list, items: displayed.value, minItemSize: 72, listTag: 'ol', itemTag: 'li' }, { default: ({ index }: HistoireVirtualSlot) => {
          const event = displayed.value[index].event
          const payload = event.payload as { name?: string, argument?: unknown } | null
          const name = typeof payload?.name === 'string' ? payload.name : 'Event'
          const argument = payload && Object.hasOwn(payload, 'argument') ? payload.argument : event.payload
          const heading = [name, h('time', { datetime: new Date(event.timestamp).toISOString() }, props.inlineDetails ? new Date(event.timestamp).toLocaleTimeString(undefined, { hour12: false }) : new Date(event.timestamp).toISOString())]
          // Inline cards already expose their payload, so they need no floating trigger.
          if (props.inlineDetails) {
            return h('div', { 'class': 'histoire-event-row', 'data-test-id': 'event-item' }, [
              h('div', { class: 'histoire-event-heading' }, heading),
              h('pre', { class: 'histoire-event-argument' }, JSON.stringify(argument, null, 2)),
            ])
          }
          return h('div', { class: 'histoire-event-row' }, h(HistoireDropdown, { 'placement': 'right', 'data-test-id': 'event-item' }, {
            default: () => h(HstButton, { color: 'flat', type: 'button' }, { default: () => heading }),
            popper: () => h('pre', JSON.stringify(argument, null, 2)),
          }))
        } }),
      ])
    }
  },
})
