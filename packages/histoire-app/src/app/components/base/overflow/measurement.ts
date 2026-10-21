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

/** Attributes the overflow layout itself writes on item wrappers; they never change natural width. */
const PRESENTATION_ATTRIBUTES = new Set(['data-toolbar-presentation', 'data-separator', 'hidden'])

/** True when a mutation only reflects the layout's own presentation output on an item wrapper. */
export function isPresentationMutation(record: MutationRecord): boolean {
  return record.type === 'attributes' && PRESENTATION_ATTRIBUTES.has(record.attributeName ?? '') && (record.target as Element).classList?.contains('overflow-toolbar-item')
}

/**
 * Natural-width cache keyed by item content. Clone measurement forces layout, so items
 * whose markup did not change reuse their last width until `clear()` (resize, fonts).
 */
export function createItemWidthCache() {
  let cache = new WeakMap<HTMLElement, { signature: string, width: number }>()
  return {
    /** Cached width when content is unchanged, otherwise a fresh clone measurement. */
    measure(element: HTMLElement, host: HTMLElement): number {
      // Wrapper presentation attributes are normalized by the clone, so only content and own styling count.
      const signature = `${element.className}\u0000${element.getAttribute('style') ?? ''}\u0000${element.innerHTML}`
      const cached = cache.get(element)
      if (cached?.signature === signature) return cached.width
      const width = measureInlineItem(element, host)
      cache.set(element, { signature, width })
      return width
    },
    /** Drop every width after changes that can affect styling without touching markup. */
    clear(): void {
      cache = new WeakMap()
    },
  }
}
