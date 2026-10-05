import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { PopoverBounds } from '../popover/position.js'
import { inject } from 'vue'

/** Registration for one persistent control tree and its inline ordering marker. */
export interface OverflowToolbarItem {
  /** Stable consumer identity. */
  id: string
  /** Marker remains in source template order even when content teleports. */
  marker: ShallowRef<HTMLElement | null>
  /** Single live control wrapper. */
  element: ShallowRef<HTMLElement | null>
  /** Consumer-defined divider before this group. */
  separatorBefore: () => boolean
  /** Layout owns whether this item belongs to dropdown. */
  overflow: Ref<boolean>
  /** Empty groups consume neither width nor separators. */
  empty: Ref<boolean>
  /** Divider ownership changes when a group crosses between presentations. */
  separator: Ref<boolean>
}

/** Scoped registry connects layout, Teleports, buttons and child panels. */
export interface OverflowToolbarContext {
  /** Persistent dropdown hosts preserve stable ordering. */
  hosts: Map<string, HTMLElement>
  /** Register one item; disposer retires only that registration. */
  register: (item: OverflowToolbarItem) => () => void
  /** Request geometry refresh after consumer props change. */
  measure: () => void
  /** Dismiss after an ordinary action. */
  close: (restore?: boolean) => void
  /** Reveal a child panel requested by a shortcut while its trigger is overflowed. */
  reveal: () => void
  /** Descendant portals retain the surface boundary supplied to their toolbar. */
  bounds: () => PopoverBounds | undefined
}

/** One layout authority per toolbar. */
export const overflowToolbarKey: InjectionKey<OverflowToolbarContext> = Symbol('OverflowToolbar')
/** Presentation belongs to item instance, independent of its physical DOM parent. */
export const overflowItemKey: InjectionKey<Ref<boolean>> = Symbol('OverflowToolbarItem')

/** Canvas controls outside overflow toolbars retain normal button behavior. */
export function useOverflowToolbar() {
  return { toolbar: inject(overflowToolbarKey, undefined), overflow: inject(overflowItemKey, undefined) }
}
