import {
  JSDOM,
  VirtualConsole,
} from 'jsdom'
import { populateGlobal } from './util.js'

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

  const restoreStorageGlobals = useStorageGlobals(dom.window)
  const { keys, originals } = populateGlobal(globalThis, dom.window, { bindFunctions: true })

  function destroy() {
    keys.forEach(key => delete globalThis[key])
    originals.forEach((v, k) => {
      globalThis[k] = v
    })
    restoreStorageGlobals()
  }

  window.ResizeObserver = window.ResizeObserver || class ResizeObserver {
    disconnect(): void { /* noop */ }
    observe(_target: Element, _options?: ResizeObserverOptions): void { /* noop */ }
    unobserve(_target: Element): void { /* noop */ }
  }

  window.IntersectionObserver = window.IntersectionObserver || class IntersectionObserver {
    root: Element | null = null
    rootMargin = ''
    thresholds: number[] = []
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

function useStorageGlobals(window: Window) {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')

  Object.defineProperty(globalThis, 'localStorage', {
    value: window.localStorage,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: window.sessionStorage,
    configurable: true,
    writable: true,
  })

  return () => {
    restoreGlobal('localStorage', originalLocalStorage)
    restoreGlobal('sessionStorage', originalSessionStorage)
  }
}

function restoreGlobal(key: 'localStorage' | 'sessionStorage', descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor)
  }
  else {
    delete (globalThis as any)[key]
  }
}
