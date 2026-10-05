import type { ShallowRef } from 'vue'
import type { PopoverScope } from '../popover/scope.js'
import type { OverflowToolbarItem } from './context.js'
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { fitOverflowItems } from './fit.js'
import { measureInlineItem, toolbarAvailableWidth } from './measurement.js'

/** Per-toolbar measurements preserve control identities and focused ownership. */
export function useOverflowLayout(root: ShallowRef<HTMLElement | null>, trigger: ShallowRef<HTMLElement | null>, scope: PopoverScope, opened: () => boolean, close: () => void) {
  const items = shallowRef<OverflowToolbarItem[]>([])
  const overflowing = ref(false)
  let active = true
  let scheduled = 0
  let resize: ResizeObserver | undefined
  let mutation: MutationObserver | undefined
  let fonts: FontFaceSet | undefined
  let removedFocus: { element: Element, index: number } | undefined

  /** Resolve template order from markers rather than registration timing. */
  function ordered(): OverflowToolbarItem[] {
    return [...items.value].sort((a, b) => {
      const left = a.marker.value
      const right = b.marker.value
      return left && right ? (left.compareDocumentPosition(right) & 4 ? -1 : left === right ? 0 : 1) : 0
    })
  }

  /** Find an item even when keyboard focus sits in its descendant portal. */
  function ownsFocus(item: OverflowToolbarItem, focused: Element | null): boolean {
    if (!focused) return false
    return Boolean(item.element.value?.contains(focused) || [...scope.children].some(child => child.opened() && child.contains(focused) && item.element.value?.contains(child.anchor())))
  }

  /** Read all geometry before publishing any presentation changes. */
  async function update(): Promise<void> {
    scheduled = 0
    const element = root.value
    if (!active || !element) return
    const list = ordered()
    if (list.some((item, index) => item !== items.value[index])) items.value = list
    const focused = element.ownerDocument.activeElement
    const removed = removedFocus
    removedFocus = undefined
    const owner = list.find(item => ownsFocus(item, focused))
    const previousOverflow = owner?.overflow.value
    const focusTarget = owner?.element.value?.contains(focused) ? focused : [...scope.children].find(child => child.opened() && focused && child.contains(focused))?.anchor()
    const view = element.ownerDocument.defaultView
    const style = view?.getComputedStyle(element)
    const gap = Number.parseFloat(style?.columnGap ?? '') || 3
    const separator = (Number.parseFloat(style?.getPropertyValue('--overflow-separator-width') ?? '') || 7) + gap
    const host = element.ownerDocument.createElement('div')
    host.dataset.overflowMeasurement = ''
    host.setAttribute('aria-hidden', 'true')
    host.inert = true
    host.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;display:flex;width:max-content;inset-inline-start:0;top:0'
    element.append(host)
    let widths: { width: number, separatorBefore: boolean }[]
    let triggerWidth = 28
    try {
      widths = list.map(item => ({ width: item.element.value ? measureInlineItem(item.element.value, host) : 0, separatorBefore: item.separatorBefore() }))
      // Hidden trigger still needs its natural width on the first overflow.
      if (trigger.value) triggerWidth = measureInlineItem(trigger.value, host) || triggerWidth
    }
    finally { host.remove() }
    const count = fitOverflowItems(widths, toolbarAvailableWidth(element), triggerWidth, gap, separator)
    const hasOverflow = widths.some((item, index) => item.width > 0 && index >= count)
    let inlineBefore = false
    let menuBefore = false
    for (let index = 0; index < list.length; index++) {
      const item = list[index]
      const empty = widths[index].width <= 0
      const overflow = !empty && index >= count
      item.empty.value = empty
      item.overflow.value = overflow
      item.separator.value = !empty && item.separatorBefore() && (overflow ? menuBefore : inlineBefore)
      if (!empty) {
        if (overflow) menuBefore = true
        else inlineBefore = true
      }
    }
    overflowing.value = hasOverflow
    const focusedTrigger = focused === trigger.value
    if (!hasOverflow && opened()) close()
    await nextTick()
    if (!active) return
    const currentFocus = element.ownerDocument.activeElement
    if (currentFocus !== focused && currentFocus !== element.ownerDocument.body) return
    if (removed && (currentFocus === removed.element || currentFocus === element.ownerDocument.body)) {
      const nearest = [...list.slice(0, removed.index).reverse(), ...list.slice(removed.index)]
      const target = nearest.filter(item => !item.empty.value && (!item.overflow.value || opened())).map(item => item.element.value?.querySelector<HTMLElement>('button:not(:disabled)')).find(Boolean)
      ;(target ?? trigger.value)?.focus({ preventScroll: true })
    }
    else if (owner && (previousOverflow !== owner.overflow.value || owner.empty.value)) {
      if (owner.overflow.value && !opened()) {
        trigger.value?.focus({ preventScroll: true })
      }
      else if (owner.empty.value) {
        ;(overflowing.value ? trigger.value : element.querySelector<HTMLElement>('button:not(:disabled):not([hidden])'))?.focus({ preventScroll: true })
      }
      else if (focusTarget instanceof HTMLElement && focusTarget.isConnected) {
        focusTarget.focus({ preventScroll: true })
      }
    }
    else if (!hasOverflow && focusedTrigger) {
      element.querySelector<HTMLElement>('button:not(:disabled):not([hidden])')?.focus({ preventScroll: true })
    }
  }

  /** Resize and mutation bursts share one frame; retired callbacks do nothing. */
  function measure(): void {
    if (active && !scheduled) {
      scheduled = requestAnimationFrame(() => {
        void update()
      })
    }
  }

  /** Persistent item wrappers stay observed after their content teleports. */
  function observe(): void {
    mutation?.disconnect()
    for (const item of items.value) {
      if (!item.element.value) continue
      resize?.observe(item.element.value)
      mutation?.observe(item.element.value, { childList: true, subtree: true, characterData: true, attributes: true })
    }
  }

  /** Dispose only matching registration, preserving concurrently added groups. */
  function register(item: OverflowToolbarItem): () => void {
    items.value = [...items.value, item]
    observe()
    measure()
    return () => {
      const focused = root.value?.ownerDocument.activeElement ?? null
      if (focused && ownsFocus(item, focused)) removedFocus = { element: focused, index: ordered().indexOf(item) }
      items.value = items.value.filter(candidate => candidate !== item)
      if (item.element.value) resize?.unobserve(item.element.value)
      observe()
      measure()
    }
  }

  onMounted(() => {
    resize = new ResizeObserver(measure)
    mutation = new MutationObserver(measure)
    if (root.value?.parentElement) resize.observe(root.value.parentElement)
    if (root.value) resize.observe(root.value)
    observe()
    fonts = root.value?.ownerDocument.fonts
    fonts?.addEventListener('loadingdone', measure)
    void fonts?.ready.then(measure)
    measure()
  })
  onBeforeUnmount(() => {
    active = false
    cancelAnimationFrame(scheduled)
    resize?.disconnect()
    mutation?.disconnect()
    fonts?.removeEventListener('loadingdone', measure)
  })
  return { items, overflowing, register, measure }
}
