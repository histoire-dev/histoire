/** Bounded subtree query, shared by real browser evaluation and DOM behavior tests. */
export interface DomInspectionOptions {
  /** First matching element is root; caller supplies no executable code. */
  selector: string
  /** Maximum included elements. */
  maxNodes: number
  /** Root is depth zero. */
  maxDepth: number
}

/** Self-contained browser function; no imported values survive serialization. */
export function inspectDomDocument(options: DomInspectionOptions, rootDocument: Document = document) {
  const root = rootDocument.querySelector(options.selector)
  const nodes: { index: number, parentIndex: number | null, tag: string, attributes: Record<string, string>, text: string, rect: { x: number, y: number, width: number, height: number }, styles: Record<string, string> }[] = []
  let truncated = false
  let bytes = 0
  let byteBudgetExhausted = false
  /** Append complete rows only; both traversal and serialized result stay bounded. */
  function visit(element: Element, parentIndex: number | null, depth: number): void {
    if (['script', 'style', 'noscript', 'template'].includes(element.localName)) return
    if (nodes.length >= options.maxNodes) {
      truncated = true
      return
    }
    const attributes: Record<string, string> = {}
    for (const name of element.getAttributeNames()) {
      if (!['id', 'class', 'role', 'type', 'disabled', 'checked', 'data-testid', 'data-test-id', 'href', 'src'].includes(name) && !name.startsWith('aria-')) continue
      if (Object.keys(attributes).length >= 32) {
        truncated = true
        break
      }
      let value = element.getAttribute(name) ?? ''
      if (name === 'href' || name === 'src') {
        try {
          const url = new URL(value, rootDocument.baseURI)
          if (!['http:', 'https:'].includes(url.protocol)) continue
          value = url.origin + url.pathname
        }
        catch { continue }
      }
      if (value.length > 512) truncated = true
      attributes[name] = value.slice(0, 512)
    }
    const style = rootDocument.defaultView!.getComputedStyle(element)
    const styles: Record<string, string> = {}
    for (const name of ['display', 'visibility', 'position', 'color', 'backgroundColor', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'padding', 'margin', 'border', 'borderRadius', 'opacity', 'overflow', 'boxSizing']) {
      const value = String(style[name] ?? '')
      if (value.length > 512) truncated = true
      styles[name] = value.slice(0, 512)
    }
    const bounds = element.getBoundingClientRect()
    const rect = { x: 0, y: 0, width: 0, height: 0 }
    for (const name of ['x', 'y', 'width', 'height'] as const) rect[name] = Number.isFinite(bounds[name]) ? bounds[name] : 0
    // Direct text avoids duplicated subtree text and executable script contents.
    const text = element.localName === 'textarea' || element.getAttribute('type') === 'password' ? '' : Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
    if (text.length > 1000) truncated = true
    const tag = element.localName
    if (tag.length > 128) truncated = true
    const row = { index: nodes.length, parentIndex, tag: tag.slice(0, 128), attributes, text: text.slice(0, 1000), rect, styles }
    const size = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1
    if (bytes + size > 60 * 1024) {
      truncated = true
      byteBudgetExhausted = true
      return
    }
    bytes += size
    nodes.push(row)
    const descendants = [element.children, element.shadowRoot?.children].filter(Boolean) as HTMLCollection[]
    if (depth >= options.maxDepth) {
      if (descendants.some(children => children.length)) truncated = true
      return
    }
    for (const children of descendants) {
      for (let index = 0; index < children.length; index++) {
        if (nodes.length >= options.maxNodes || byteBudgetExhausted || bytes >= 60 * 1024) {
          truncated = true
          return
        }
        visit(children.item(index)!, row.index, depth + 1)
      }
    }
  }
  if (root) visit(root, null, 0)
  return { matched: !!root, nodes, truncated }
}
