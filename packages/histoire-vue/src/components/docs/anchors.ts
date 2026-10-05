/** Find exact ID within panel only; avoid selector injection and host document anchors. */
export function scrollDocsAnchor(root: Element, hash: string): boolean {
  let id: string
  try {
    id = decodeURIComponent(hash.replace(/^#/, ''))
  }
  catch { return false }
  if (!id) return false
  const target = Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(element => element.id === id)
  if (!target) return false
  // scrollIntoView would also scroll host ancestors. Move this panel alone.
  // Standalone docs page can own the scroll area surrounding renderer. Native
  // docs panels keep their own scroll owner unless host marks one explicitly.
  const panel = (root.closest('[data-histoire-docs-scroll]') ?? root) as HTMLElement
  const bounds = panel.getBoundingClientRect()
  const scale = panel.offsetHeight > 0 && Number.isFinite(bounds.height) && bounds.height > 0 ? bounds.height / panel.offsetHeight : 1
  const delta = (target.getBoundingClientRect().top - bounds.top) / scale - panel.clientTop
  if (!Number.isFinite(delta)) return false
  panel.scrollTop += delta
  return true
}
