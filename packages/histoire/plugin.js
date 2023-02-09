export function sendEvent (event, payload) {
  if (window.__HST_PLUGIN_API__) {
    return window.__HST_PLUGIN_API__.sendDevEvent(event, payload)
  }
}
