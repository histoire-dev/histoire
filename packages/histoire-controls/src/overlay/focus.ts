import type { HistoireControlsOverlayResult } from '@histoire/shared'
import { getControlsHost } from '@histoire/shared'

/** Shared listbox navigation uses owning document rather than global document. */
export function moveControlsOptionFocus(list: HTMLElement | null, event: KeyboardEvent): void {
  const buttons = Array.from(list?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled):not([aria-disabled="true"])') ?? [])
  if (!buttons.length) return
  const index = buttons.indexOf(list!.ownerDocument.activeElement as HTMLButtonElement)
  let next: number
  if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
  else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = buttons.length - 1
  else return
  event.preventDefault()
  const button = buttons[next]
  button?.focus()
  // Explicitly reveal the choice inside a bounded popper. Focus alone can
  // leave Home/End targets clipped when native focus scrolling is suppressed.
  button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

/** Focus selected enabled option, falling back to first available choice. */
export function focusControlsSelectedOption(list: HTMLElement | null): void {
  const buttons = Array.from(list?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled):not([aria-disabled="true"])') ?? [])
  const button = buttons.find(button => button.getAttribute('aria-selected') === 'true') ?? buttons[0]
  button?.focus()
  button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

/** Keep valid keyboard position; recover when its option disappears or disables. */
export function reconcileControlsOptionFocus(list: HTMLElement | null): void {
  if (!list) return
  const current = list.ownerDocument.activeElement
  if (!list.contains(current) || current?.matches(':disabled, [aria-disabled="true"]')) focusControlsSelectedOption(list)
}

/** Restores selection focus or continues Tab traversal across the iframe boundary. */
export function restoreControlsFocus(anchor: HTMLElement | null, result: HistoireControlsOverlayResult) {
  if (!anchor || !result.restoreFocus) return
  if (!result.focusDirection) {
    anchor.focus()
    return
  }
  let boundary: HTMLElement = anchor
  let document = anchor.ownerDocument
  const direction = result.focusDirection === 'previous' ? -1 : 1
  while (true) {
    const controls = Array.from(document.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], iframe, [tabindex]'))
      .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && !control.closest('[inert]') && control.getClientRects().length)
    const next = controls[controls.indexOf(boundary) + direction]
    if (next) {
      next.focus()
      return
    }
    // A host-rendered listbox owns focus while open. At the form's edge, resume
    // traversal beside its iframe instead of trapping Tab on the select button.
    let frame: HTMLElement | null
    let parentDocument: Document | undefined
    try {
      const view = document.defaultView
      // Opaque cross-origin WindowProxy has null prototype. Avoid its frame
      // getter entirely: WebKit can report denied access even inside catch.
      // Same guarded lookup used by Floating UI's getFrameElement utility.
      if (view?.parent && !Object.getPrototypeOf(view.parent)) {
        getControlsHost()?.requestFocus?.(result.focusDirection)
        return
      }
      frame = view?.frameElement as HTMLElement | null
      // WebKit may expose opaque frameElement whose ownerDocument is guarded.
      // Read both inside same guard; only finite focus intent crosses boundary.
      parentDocument = frame?.ownerDocument
      if (!frame && document.defaultView?.parent !== document.defaultView) {
        getControlsHost()?.requestFocus?.(result.focusDirection)
        return
      }
    }
    catch {
      getControlsHost()?.requestFocus?.(result.focusDirection)
      return
    }
    if (!frame) {
      anchor.focus()
      return
    }
    boundary = frame
    document = parentDocument!
  }
}
