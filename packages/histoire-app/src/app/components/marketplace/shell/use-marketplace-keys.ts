import type { MarketplaceStore } from '../../../stores/marketplace.js'

/** Wrap edge Tab stops; native dialogs otherwise allow focus into browser chrome. */
function wrapFocus(event: KeyboardEvent): void {
  const dialog = event.currentTarget
  if (!(dialog instanceof HTMLElement)) return
  const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], iframe, [tabindex], [contenteditable="true"]')]
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length)
  const active = dialog.ownerDocument.activeElement
  const target = event.shiftKey && active === controls[0] ? controls.at(-1) : !event.shiftKey && active === controls.at(-1) ? controls[0] : undefined
  if (target) {
    event.preventDefault()
    target.focus()
  }
}

/** Handle modal shortcuts locally so workbench shortcuts cannot consume typing. */
export function useMarketplaceKeys(store: MarketplaceStore, focusSearch: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.defaultPrevented || event.isComposing) return
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) wrapFocus(event)
    if (event.key === 'Escape') {
      event.preventDefault()
      store.close()
      return
    }
    const target = event.target
    const editable = target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')
    if (event.key === '/' && !editable && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      focusSearch()
    }
  }
}
