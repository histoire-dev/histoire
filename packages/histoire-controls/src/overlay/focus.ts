import type { HistoireControlsOverlayResult } from '@histoire/shared'

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
    const frame = document.defaultView?.frameElement as HTMLElement | null
    if (!frame) {
      anchor.focus()
      return
    }
    boundary = frame
    document = frame.ownerDocument
  }
}
