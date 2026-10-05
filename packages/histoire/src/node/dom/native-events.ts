/** Node constructors captured before collection loads Vite's DOM dependencies. */
const nativeEvent = globalThis.Event
const nativeMessageEvent = globalThis.MessageEvent

/**
 * Restores Node event constructors required by native BroadcastChannel after
 * JSDOM's globals have been installed for a story-collection pass.
 */
export function restoreNativeEventGlobals(): void {
  if (nativeEvent) {
    globalThis.Event = nativeEvent
  }
  if (nativeMessageEvent) {
    globalThis.MessageEvent = nativeMessageEvent
  }
}
