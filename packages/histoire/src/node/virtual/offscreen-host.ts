/**
 * Moves a test mount host off the viewport without touching `display`,
 * `visibility` or `opacity`: the host is the canvas user tests assert on, so
 * it must keep real layout (sizes, scroll, responsive styles) and pass
 * visibility checks like `toBeVisible()`. A fixed-position element outside
 * the viewport cannot create scrollbars, so the mount stays invisible to the
 * user without affecting the page.
 * @param host The mount host element appended to the document body.
 */
export function applyOffscreenHostStyle(host: HTMLElement) {
  host.style.position = 'fixed'
  host.style.top = '0px'
  host.style.left = '-10000px'
  host.style.width = '100vw'
  host.style.height = '100vh'
}
