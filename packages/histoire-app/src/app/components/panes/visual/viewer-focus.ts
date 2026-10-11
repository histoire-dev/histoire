/** Keep keyboard navigation inside wide review while pointer users can select pane rows. */
export function trapVisualViewerFocus(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') {
    return
  }
  const elements = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(element => element.getClientRects().length)
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && (root.ownerDocument.activeElement === first || root.ownerDocument.activeElement === root)) {
    event.preventDefault()
    last?.focus()
  }
  else
    if (!event.shiftKey && (root.ownerDocument.activeElement === last || root.ownerDocument.activeElement === root)) {
      event.preventDefault()
      first?.focus()
    }
}

/** Removed Changes rows restore focus to stable Tests-pane action. */
export function restoreVisualViewerFocus(document: Document, original: HTMLElement | null): void {
  const target = original?.isConnected ? original : document.querySelector<HTMLElement>('[aria-label="Visual tests"] button:not([disabled])')
  target?.focus({ preventScroll: true })
}
