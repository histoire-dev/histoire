/**
 * Emits the runtime error reporter: a full-body message before the Vue app has
 * booted, a bottom overlay afterwards (so a late unhandled rejection does not
 * destroy the mounted preview), plus the global `error` /
 * `unhandledrejection` listeners that feed it.
 */
export function previewErrorOverlay() {
  return `const RUNTIME_ERROR_OVERLAY_ID = '__histoire-runtime-error'

function renderRuntimeError(error) {
  const message = error instanceof Error
    ? (error.stack ?? error.message)
    : String(error)

  // If the Vue app has not booted yet, render the error in place of the empty
  // body. Otherwise overlay the error so the previously mounted preview is not
  // destroyed by a late unhandled rejection (e.g. a flaky user vi.mock).
  const appMounted = !!document.getElementById('app')

  if (!appMounted) {
    document.body.innerHTML = ''
    document.body.appendChild(createRuntimeErrorBlock(message))
    return
  }

  let overlay = document.getElementById(RUNTIME_ERROR_OVERLAY_ID)
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = RUNTIME_ERROR_OVERLAY_ID
    overlay.style.position = 'fixed'
    overlay.style.bottom = '0'
    overlay.style.left = '0'
    overlay.style.right = '0'
    overlay.style.maxHeight = '50vh'
    overlay.style.overflow = 'auto'
    overlay.style.zIndex = '2147483647'
    overlay.style.borderTop = '2px solid #fca5a5'
    document.body.appendChild(overlay)
  }
  else {
    overlay.innerHTML = ''
  }
  overlay.appendChild(createRuntimeErrorBlock(message))
}

function createRuntimeErrorBlock(message) {
  const pre = document.createElement('pre')
  pre.style.whiteSpace = 'pre-wrap'
  pre.style.padding = '16px'
  pre.style.margin = '0'
  pre.style.fontFamily = 'monospace'
  pre.style.fontSize = '12px'
  pre.style.color = '#fca5a5'
  pre.style.background = '#111827'
  pre.textContent = message
  return pre
}

window.addEventListener('error', event => {
  renderRuntimeError(event.error ?? event.message)
})

window.addEventListener('unhandledrejection', event => {
  renderRuntimeError(event.reason)
})`
}
