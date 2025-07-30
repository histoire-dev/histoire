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
      virtualConsole: console && globalThis.console ? new VirtualConsole().sendTo(globalThis.console) : undefined,
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

  return {
    window,
    destroy,
  }
}
