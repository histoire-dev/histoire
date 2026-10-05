import {
  JSDOM,
  VirtualConsole,
} from 'jsdom'
import { restoreNativeEventGlobals } from './native-events.js'
import { populateGlobal } from './util.js'

/** Installs one collection window and owns its resources until teardown. */
export function createDomEnv() {
  const dom = new JSDOM(
    '<!DOCTYPE html>',
    {
      pretendToBeVisual: true,
      runScripts: 'dangerously',
      url: 'http://localhost:3000',
      virtualConsole: console && globalThis.console ? new VirtualConsole().forwardTo(globalThis.console) : undefined,
      includeNodeLocations: false,
      contentType: 'text/html',
    },
  )

  const { keys, originals } = populateGlobal(globalThis, dom.window, { bindFunctions: true })

  // Node's BroadcastChannel builds its delivery events from global constructors.
  // Replacing them with jsdom's incompatible classes makes message delivery throw
  // on Node 24. Keep Node's pair while the native channel is available.
  if (typeof globalThis.BroadcastChannel === 'function') {
    restoreNativeEventGlobals()
  }

  let destroyed = false
  /** Close timers/documents while their globals exist; retired cleanup is inert. */
  function destroy() {
    if (destroyed) return
    destroyed = true
    try {
      // Restoring globals alone leaves jsdom timers and documents alive across
      // every recollection in this persistent worker, retaining entire stories.
      dom.window.close()
    }
    finally {
      keys.forEach(key => delete globalThis[key])
      originals.forEach((v, k) => {
        globalThis[k] = v
      })
    }
  }

  window.ResizeObserver = window.ResizeObserver || class ResizeObserver {
    disconnect(): void { /* noop */ }
    observe(_target: Element, _options?: ResizeObserverOptions): void { /* noop */ }
    unobserve(_target: Element): void { /* noop */ }
  }

  window.IntersectionObserver = window.IntersectionObserver || class IntersectionObserver {
    root: Element
    rootMargin: string
    thresholds: number[]
    disconnect(): void { /* noop */ }
    observe = (_target: Element) => void { /* noop */ }
    unobserve(_target: Element): void { /* noop */ }
    takeRecords(): IntersectionObserverEntry[] { return [] }
  }

  window.matchMedia = window.matchMedia || ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))

  return {
    window: dom.window,
    destroy,
  }
}
