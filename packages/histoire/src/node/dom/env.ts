import {
  JSDOM,
  VirtualConsole,
} from 'jsdom'
import { populateGlobal } from './util.js'

// jsdom error types — not exported by jsdom.
const JSDOM_ERROR_CSS_PARSING = 'css-parsing'
const JSDOM_ERROR_UNHANDLED_EXCEPTION = 'unhandled-exception'

// Tailwind directives (@tailwind, @apply, @theme) crash JSDOM's CSS parser
// and dump the whole stylesheet to stderr. Drop css-parsing errors; mirror
// jsdom's default forwardTo for the rest.
function createVirtualConsole(): VirtualConsole | undefined {
  if (!console || !globalThis.console) return undefined
  const virtualConsole = new VirtualConsole().forwardTo(globalThis.console, { jsdomErrors: 'none' })
  virtualConsole.on('jsdomError', (err: Error & { type?: string, cause?: { stack?: string } }) => {
    if (err.type === JSDOM_ERROR_CSS_PARSING) return
    if (err.type === JSDOM_ERROR_UNHANDLED_EXCEPTION) {
      globalThis.console.error(err.cause?.stack ?? err.message)
    }
    else {
      globalThis.console.error(err.message)
    }
  })
  return virtualConsole
}

export function createDomEnv() {
  const dom = new JSDOM(
    '<!DOCTYPE html>',
    {
      pretendToBeVisual: true,
      runScripts: 'dangerously',
      url: 'http://localhost:3000',
      virtualConsole: createVirtualConsole(),
      includeNodeLocations: false,
      contentType: 'text/html',
    },
  )

  const { keys, originals } = populateGlobal(globalThis, dom.window, { bindFunctions: true })

  function destroy() {
    keys.forEach(key => delete globalThis[key])
    originals.forEach((v, k) => {
      globalThis[k] = v
    })
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
    window,
    destroy,
  }
}
