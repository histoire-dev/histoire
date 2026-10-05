import { vi } from 'vitest'
import { nextTick } from 'vue'

/** Model available host width and explicit control sizes without testing CSS. */
export function toolbarGeometry(initialWidth = 300) {
  let available = initialWidth
  let frameId = 0
  const frames = new Map<number, FrameRequestCallback>()
  const observers = new Set<{ callback: ResizeObserverCallback, targets: Set<Element> }>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class {
    /** Callback and targets remain local to each owning component. */
    state: { callback: ResizeObserverCallback, targets: Set<Element> }
    /** Register native-style geometry observation. */
    constructor(callback: ResizeObserverCallback) {
      this.state = { callback, targets: new Set() }
      observers.add(this.state)
    }

    /** Track one observed element. */
    observe = (target: Element) => this.state.targets.add(target)
    /** Release one removed control. */
    unobserve = (target: Element) => this.state.targets.delete(target)
    /** Retire callbacks after unmount. */
    disconnect = () => observers.delete(this.state)
  })
  /** Widths describe controls, not their menu presentation. */
  function width(element: HTMLElement): number {
    if (element.classList.contains('toolbar-test-host')) return Number(element.dataset.available ?? available)
    if (element.dataset.width) return Number(element.dataset.width)
    if (element.tagName === 'BUTTON') return 28
    if (element.getAttribute('aria-haspopup') === 'menu' && element.getAttribute('aria-label')?.startsWith('More')) return 28
    return [...element.children].reduce((total, child) => total + width(child as HTMLElement), 0)
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const size = width(this)
    return { x: 8, y: 16, left: 8, top: 16, right: 8 + size, bottom: 52, width: size, height: 36, toJSON: () => ({}) }
  })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    const hidden = this.closest('[hidden], .histoire-base-popover[style*="display: none"]')
    return (hidden ? [] : [this.getBoundingClientRect()]) as unknown as DOMRectList
  })
  return {
    /** Deliver native resize callbacks after changing host width. */
    resize(value: number) {
      available = value
      for (const observer of observers) observer.callback([...observer.targets].map(target => ({ target, contentRect: target.getBoundingClientRect() }) as ResizeObserverEntry), {} as ResizeObserver)
    },
    /** Flush Vue and scheduled measurement work, including observer follow-ups. */
    async flush(passes = 8) {
      for (let pass = 0; pass < passes; pass++) {
        await nextTick()
        await Promise.resolve()
        const pending = [...frames.values()]
        frames.clear()
        pending.forEach(callback => callback(0))
      }
    },
    /** Unmount must release scheduled frames and geometry observers. */
    pending: () => ({ frames: frames.size, observers: observers.size }),
  }
}
