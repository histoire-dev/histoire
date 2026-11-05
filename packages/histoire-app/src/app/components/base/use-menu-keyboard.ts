import type { Ref } from 'vue'
import { ref } from 'vue'

/** Native enabled rows belonging to this menu, excluding nested or hidden menus. */
export function menuItems(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')]
    .filter(item => item.closest('[role="menu"]') === menu && !item.matches(':disabled, [aria-disabled="true"]') && !item.closest('[hidden], [inert], [aria-hidden="true"]'))
}

/** Menu ownership and its existing Tab-dismissal policy. */
interface MenuKeyboardOptions {
  /** Visibility controlled by menus with a trigger. */ open?: Ref<boolean>
  /** Trigger restored when Tab dismissal is contained. */ anchor?: () => HTMLElement | null | undefined
  /** Dismissal for menus whose visibility belongs to another controller. */ close?: () => void
  /** Native Tab leaves focus movement to browser; submenus bubble to root dismissal. */ tab?: 'native' | 'restore' | 'bubble'
}

/** Shared menu movement; Escape remains owned by the enclosing popover or controller. */
export function useMenuKeyboard(options: MenuKeyboardOptions) {
  const focusLast = ref(false)
  /** Arrow opening selects the corresponding enabled edge. */
  function openMenu(event: KeyboardEvent): void {
    if (event.defaultPrevented || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    focusLast.value = event.key === 'ArrowUp'
    if (options.open) options.open.value = true
  }
  /** Move only within this menu; nested menus retain their own keyboard ownership. */
  function navigate(event: KeyboardEvent): void {
    if (event.defaultPrevented) return
    const currentTarget = event.currentTarget as HTMLElement
    const menu = currentTarget.closest<HTMLElement>('[role="menu"]') ?? currentTarget
    if (event.key === 'Tab') {
      if (options.tab === 'bubble') return
      options.close?.()
      if (options.open) options.open.value = false
      if (options.tab !== 'native') {
        event.preventDefault()
        options.anchor?.()?.focus()
      }
      event.stopPropagation()
      return
    }
    if ((event.target as HTMLElement).closest('[role="menu"]') !== menu) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const rows = menuItems(menu)
    if (!rows.length) return
    const current = rows.indexOf(menu.ownerDocument.activeElement as HTMLElement)
    // No focused row starts at the requested edge; movement otherwise wraps.
    let next = current < 0
      ? event.key === 'ArrowDown' ? 0 : rows.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = rows.length - 1
    event.preventDefault()
    event.stopPropagation()
    rows[next].focus()
  }
  return { focusLast, openMenu, navigate }
}
