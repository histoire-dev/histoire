import type { HistoireControlsOverlayMessage, HistoireControlsOverlayResult } from '@histoire/protocol'
import type { PropType } from 'vue'
import { focusControlsSelectedOption, HstButton, moveControlsOptionFocus, reconcileControlsOptionFocus } from '@histoire/controls/vue'
import { defineComponent, h, nextTick, ref, Teleport, watch } from 'vue'
import { HistoireDropdown, HistoireTooltip } from '../foundation/floating.js'
import { useHistoireContext, useHistoireResource } from '../provider/context.js'
import { providerOverlayRect } from './geometry.js'
import { observeControlsMenuBounds } from './menu-bounds.js'
/** Scoped finite presentation; values/callbacks remain inside controls sandbox. */
export const HistoireControlsOverlayHost = defineComponent({
  name: 'HistoireControlsOverlayHost',
  props: { request: { type: Object as PropType<HistoireControlsOverlayMessage>, required: true } },
  emits: { result: (_id: string, _result: HistoireControlsOverlayResult) => true },
  setup(props, { emit }) {
    const context = useHistoireContext()
    const list = ref<HTMLElement | null>(null)
    const popper = ref<any>(null)
    const maximumHeight = ref<number | undefined>()
    let bounds: ReturnType<typeof observeControlsMenuBounds> | undefined
    let active = true
    /** Echo opaque overlay identity; late hide can never resolve replacement menu. */
    function result(value: HistoireControlsOverlayResult): void {
      if (active) {
        emit('result', props.request.id, value)
      }
    }
    /** Preserve current keyboard focus when a resized scrollport gets a new cap. */
    function setMaximumHeight(value: number | undefined): void {
      maximumHeight.value = value
      const owner = list.value
      void nextTick().then(() => {
        if (!active || !owner || list.value !== owner) return
        const focused = owner.ownerDocument.activeElement
        // Never restore selectedId here: End/Arrow navigation may focus another
        // opaque choice. Reveal only the current option in this exact menu.
        if (focused?.getAttribute('role') === 'option' && owner.contains(focused)) {
          focused.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }).catch((error) => {
        if (active && list.value === owner) context.reportError(error)
      })
    }
    /** Focus only after actual popper shown; owner identity checked again by controller. */
    async function focusSelected(): Promise<void> {
      await nextTick()
      const options = props.request.overlay
      if (!active || options?.kind !== 'select') {
        return
      }
      bounds?.close()
      bounds = list.value ? observeControlsMenuBounds(list.value, setMaximumHeight) : undefined
      await nextTick()
      if (!active) return
      focusControlsSelectedOption(list.value)
    }
    /** Tab closes before finite cross-frame traversal; Escape returns source anchor. */
    function keydown(event: KeyboardEvent): void {
      if (event.key === 'Tab' || event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        result({ restoreFocus: true, ...(event.key === 'Tab' ? { focusDirection: event.shiftKey ? 'previous' as const : 'next' as const } : {}) })
      }
      else {
        moveControlsOptionFocus(list.value, event)
      }
    }
    // Reordering retains current option focus; removed/disabled choices recover.
    watch(() => props.request.overlay, (overlay) => {
      if (!active || overlay?.kind !== 'select') return
      if (!overlay.items.length) result({ restoreFocus: true })
      else reconcileControlsOptionFocus(list.value)
    }, { deep: true, flush: 'post' })
    watch(() => props.request.anchor, async () => {
      await nextTick()
      popper.value?.onResize?.()
      bounds?.update()
    })
    useHistoireResource(() => {
      active = false
      bounds?.close()
    })
    return () => {
      const overlay = props.request.overlay
      if (!overlay || !context.root.value || !context.overlay.value) {
        return null
      }
      const rect = providerOverlayRect(context.root.value, props.request.anchor)
      const options = overlay.kind === 'select' ? overlay : undefined
      const tooltip = overlay.kind === 'tooltip' ? overlay : undefined
      return h(Teleport, { to: context.overlay.value }, h(options ? HistoireDropdown : HistoireTooltip, {
        ref: popper,
        key: props.request.id,
        shown: true,
        triggers: [],
        autoHide: !!options,
        autoSize: !!options,
        autoBoundaryMaxSize: true,
        placement: tooltip?.placement ?? 'bottom',
        distance: tooltip?.distance ?? 8,
        noAutoFocus: true,
        eagerMount: true,
        class: 'histoire-controls-anchor',
        style: { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` },
        onApplyShow: focusSelected,
        onHide: () => result({ restoreFocus: false }),
      }, {
        default: () => h('span', { 'aria-hidden': true }),
        popper: () => options
          ? h('div', { 'ref': list, 'role': 'listbox', 'aria-label': options.label ?? 'Options', 'class': 'histoire-controls-options', 'data-histoire-control-appearance': context.root.value?.dataset.histoireAppearance, 'style': maximumHeight.value === undefined ? undefined : { '--histoire-control-menu-boundary': `${maximumHeight.value}px` }, 'onKeydown': keydown }, options.items.map(item => h(HstButton, { 'key': item.id, 'type': 'button', 'role': 'option', 'color': 'flat', 'disabled': item.disabled, 'aria-selected': item.id === options.selectedId, 'onClick': () => !item.disabled && result({ itemId: item.id, restoreFocus: true }) }, { default: () => item.label })))
          : h('span', { role: 'tooltip', class: 'histoire-controls-tooltip' }, tooltip?.content),
      }))
    }
  },
})
