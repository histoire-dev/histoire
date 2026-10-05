import type { PropType, SlotsType, VNodeChild } from 'vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem, RecycleScroller } from 'vue-virtual-scroller'

/** Stable row identity stays separate from recycled DOM view identity. */
export interface HistoireVirtualItem {
  /** Exact caller-owned identity; never a position or concatenated target ID. */
  key: string
  /** Optional recycling pool discriminator for headings and content rows. */
  kind?: string
}

/** Typed slot contract mirrors the installed scroller's public runtime slot. */
export interface HistoireVirtualSlot {
  /** Exact row currently assigned to this recycled view. */
  item: HistoireVirtualItem
  /** Current source-array position, independent from recycled view identity. */
  index: number
  /** Inactive views render no controls or retained private row data. */
  active: boolean
}

/** Structural public capabilities work with both NodeNext and the app's bundler graph. */
interface VirtualScrollerHandle {
  /** Both installed scrollers reveal current array positions with nearest alignment. */
  scrollToItem: (index: number, options?: { align: 'nearest' }) => void
  /** Only RecycleScroller exposes direct refresh; DynamicScroller acknowledges update events. */
  updateVisibleItems?: (itemsChanged: boolean, checkPositionDiff?: boolean) => unknown
}

/** List actions reveal keyboard targets before querying recycled row elements. */
export interface HistoireVirtualListHandle {
  /** Reveal exact current row; removed rows cannot acquire another row's focus. */
  reveal: (key: string) => Promise<HTMLElement | undefined>
  /** Focus exact row's first native interactive control. */
  focus: (key: string) => Promise<void>
}

/** Shared SDK/app virtual scrolling surface; it never owns selection or data requests. */
export const HistoireVirtualList = defineComponent({
  name: 'HistoireVirtualList',
  inheritAttrs: false,
  props: {
    /** Caller projections retain their exact keys and arbitrary row metadata. */
    items: { type: Array as PropType<readonly HistoireVirtualItem[]>, required: true },
    /** Known row height uses cheap fixed-size recycling; omitted height is measured. */
    itemSize: { type: Number, default: undefined },
    /** Measured lists reserve an estimated minimum height before discovery. */
    minItemSize: { type: Number, default: 40 },
    /** Follow nearest scrolling parent for lists embedded beside other sections. */
    pageMode: { type: Boolean, default: false },
    /** Preserve native list semantics where the calling surface uses them. */
    listTag: { type: String, default: 'div' },
    /** Native list item or generic tree presentation wrapper. */
    itemTag: { type: String, default: 'div' },
  },
  slots: Object as SlotsType<{ default: (value: HistoireVirtualSlot) => VNodeChild }>,
  setup(props, { attrs, slots, expose }) {
    // The library accepts mutable arrays; caller-owned readonly publications stay intact.
    const items = computed(() => Array.from(props.items))
    const root = ref<HTMLElement>()
    const scroller = ref<VirtualScrollerHandle>()
    let active = true
    let action = 0
    let pending: (() => void) | undefined
    /** Mounted-range updates and retirement release the current dynamic row waiter once. */
    function wake(): void {
      const resolve = pending
      pending = undefined
      resolve?.()
    }
    /** New navigation cancels any previous wait before taking ownership. */
    function begin(): number {
      wake()
      return ++action
    }
    onBeforeUnmount(() => {
      active = false
      begin()
    })
    watch(() => props.items, wake, { flush: 'post' })
    /** Native scroll events arrive later than Vue ticks; flush the library's public recycler. */
    async function resolveRow(key: string, request: number): Promise<HTMLElement | undefined> {
      await nextTick()
      if (!active || request !== action) return
      const index = props.items.findIndex(item => item.key === key)
      if (index < 0) return
      const current = scroller.value
      current?.scrollToItem(index, { align: 'nearest' })
      current?.updateVisibleItems?.(false, true)
      await nextTick()
      for (;;) {
        if (!active || request !== action || !props.items.some(item => item.key === key)) return
        const row = Array.from(root.value?.querySelectorAll<HTMLElement>('[data-virtual-key]') ?? []).find(element => element.dataset.virtualKey === key)
        if (row || props.itemSize !== undefined) return row
        // DynamicScroller forwards the recycler's update event; never reset measured sizes.
        await new Promise<void>((resolve) => {
          pending = resolve
        })
        await nextTick()
      }
    }
    /** Removed or superseded keyboard rows cannot acquire another view's focus. */
    function reveal(key: string): Promise<HTMLElement | undefined> {
      return resolveRow(key, begin())
    }
    /** Recycled buttons cannot become an unintended target while moving focus. */
    async function focus(key: string): Promise<void> {
      const request = begin()
      const row = await resolveRow(key, request)
      if (active && request === action) row?.querySelector<HTMLElement>('button:not(:disabled), [tabindex], a[href]')?.focus({ preventScroll: true })
    }
    expose({ reveal, focus } satisfies HistoireVirtualListHandle)
    return () => {
      const dynamic = props.itemSize === undefined
      return h('div', { ...attrs, ref: root, class: ['histoire-virtual-list', attrs.class, { 'histoire-virtual-list-page': props.pageMode }] }, [
        h(dynamic ? DynamicScroller : RecycleScroller, {
          ref: scroller,
          items: items.value,
          keyField: 'key',
          typeField: 'kind',
          itemSize: props.itemSize,
          minItemSize: props.minItemSize,
          pageMode: props.pageMode,
          // Flow keeps source order in DOM, including keyboard and screen-reader reading.
          flowMode: true,
          listTag: props.listTag,
          itemTag: props.itemTag,
          buffer: 160,
          prerender: 12,
          emitUpdate: true,
          onUpdate: wake,
        }, {
          default: (value: HistoireVirtualSlot) => {
            // Retired pool slots cannot read a replacement publication by old index.
            if (!value.active || props.items[value.index]?.key !== value.item.key) return null
            const row = () => h('div', { 'key': value.item.key, 'data-virtual-key': value.item.key, 'style': { paddingBottom: '1px' } }, [slots.default?.(value)])
            return dynamic ? h(DynamicScrollerItem, { item: value.item, active: value.active, index: value.index }, { default: row }) : row()
          },
        }),
      ])
    }
  },
})
