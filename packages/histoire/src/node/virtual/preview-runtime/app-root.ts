/**
 * Emits the app root element creation and `observeControlsResize`, which
 * reports the rendered controls height so the host can size the controls panel
 * iframe to its content.
 */
export function previewAppRoot() {
  return `const root = document.createElement('div')
root.id = 'app'
document.body.innerHTML = ''
document.body.appendChild(root)

let controlsResizeObserver = null

/**
 * Reports the rendered controls height to the host so the panel iframe can
 * size itself to its content. Idempotent — one observer per sandbox.
 *
 * Measures scrollHeight instead of box height: the sandbox stylesheet gives
 * the root a 100%-of-viewport height, and this iframe starts at 0px — box
 * height would stay 0 forever (chicken-and-egg with the host sizing).
 */
function observeControlsResize() {
  if (controlsResizeObserver || typeof ResizeObserver === 'undefined') {
    return
  }

  const postHeight = () => {
    postToParent({ type: CONTROLS_RESIZE, height: document.documentElement.scrollHeight })
  }

  controlsResizeObserver = new ResizeObserver(postHeight)
  // The controls container tracks its content height (unlike the root, whose
  // viewport-bound box never resizes with content).
  controlsResizeObserver.observe(root.querySelector('.__histoire-render-custom-controls') ?? root)
  postHeight()
}`
}
