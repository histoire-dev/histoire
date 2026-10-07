let editorRequest: ReturnType<typeof importEditor> | undefined

/** Import editor module behind the JSON control's lazy boundary. */
function importEditor() {
  return import('./HstJsonEditor.vue')
}

/**
 * Load the CodeMirror-backed control only after a JSON control is mounted.
 * Concurrent controls share one request; failed imports can be retried.
 * @returns Lazy editor module.
 */
export function loadHstJsonEditor() {
  if (!editorRequest) {
    const request = importEditor().catch((error) => {
      if (editorRequest === request) editorRequest = undefined
      throw error
    })
    editorRequest = request
  }
  return editorRequest
}
