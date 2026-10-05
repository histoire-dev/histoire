/** Measure inline shape without mounting another component or moving focused DOM. */
export function measureInlineItem(element: HTMLElement, host: HTMLElement): number {
  const clone = element.cloneNode(true) as HTMLElement
  clone.hidden = false
  clone.dataset.toolbarPresentation = 'inline'
  clone.dataset.separator = 'false'
  clone.inert = true
  clone.setAttribute('aria-hidden', 'true')
  // Clones exist only for a synchronous layout read. Remove identifiers before
  // insertion so portals and accessible descriptions never acquire duplicates.
  for (const node of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    for (const name of ['id', 'aria-controls', 'aria-describedby', 'aria-labelledby']) node.removeAttribute(name)
    if (node.matches('button, input, select, textarea, a, [tabindex]')) node.tabIndex = -1
  }
  host.append(clone)
  try {
    const style = clone.ownerDocument.defaultView?.getComputedStyle(clone)
    return Number.parseFloat(style?.width ?? '') || clone.getBoundingClientRect().width
  }
  finally { clone.remove() }
}

/** Resolve usable CSS width without including root border/padding or parent padding. */
export function toolbarAvailableWidth(root: HTMLElement): number {
  const view = root.ownerDocument.defaultView
  const parent = root.parentElement
  if (!view || !parent) return 0
  const style = view.getComputedStyle(parent)
  const chrome = view.getComputedStyle(root)
  /** Missing computed values occur in disconnected containers and DOM test hosts. */
  function pixels(value: string): number {
    return Number.parseFloat(value) || 0
  }
  const measured = pixels(style.width)
  const parentChrome = pixels(style.paddingLeft) + pixels(style.paddingRight) + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth)
  const width = measured ? measured - (style.boxSizing === 'border-box' ? parentChrome : 0) : parent.getBoundingClientRect().width - parentChrome
  return Math.max(0, width - pixels(chrome.paddingLeft) - pixels(chrome.paddingRight) - pixels(chrome.borderLeftWidth) - pixels(chrome.borderRightWidth))
}
