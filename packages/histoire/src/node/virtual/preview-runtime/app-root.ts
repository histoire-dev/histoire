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

if (initialSelection.controls && getHostWindow()) {
  const disposeAppearance = setupControlsDocument(getHostWindow(), value => { isDark.value = value }, previewDocumentId)
  const bridge = createControlsOverlayBridge({
    window,
    host: getHostWindow(),
    storyId: initialSelection.storyId,
    variantId: initialSelection.variantId,
    documentId: new URLSearchParams(window.location.search).get('documentId') ?? undefined,
    post: postToParent,
  })
  window.__HST_CONTROLS_HOST__ = bridge
  window.addEventListener('pagehide', () => {
    bridge.dispose()
    disposeAppearance()
    delete window.__HST_CONTROLS_HOST__
  }, { once: true })
}

let controlsResizeObserver = null

/**
 * Reports the rendered controls height to the host so the panel iframe can
 * size itself to its content. Idempotent — one observer per sandbox.
 *
 * Controls mode uses intrinsic root height. Measuring only its in-flow content
 * excludes floating overlays and allows the frame to shrink after edits.
 */
function observeControlsResize() {
  if (controlsResizeObserver || typeof ResizeObserver === 'undefined') {
    return
  }

  const postHeight = () => {
    postToParent({ type: CONTROLS_RESIZE, storyId: initialSelection.storyId, variantId: initialSelection.variantId, height: Math.ceil(root.getBoundingClientRect().height) })
  }

  controlsResizeObserver = new ResizeObserver(postHeight)
  // Controls mode gives this root intrinsic height rather than viewport height.
  controlsResizeObserver.observe(root)
  postHeight()
}`
}
