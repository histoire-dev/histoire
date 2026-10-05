import { vi } from 'vitest'

/** Deliver controlled native resize notifications without duplicating observer stubs. */
export function resizeObserverFixture() {
  const observers = new Set<{ callback: ResizeObserverCallback, targets: Set<Element> }>()
  vi.stubGlobal('ResizeObserver', class {
    /** Callback and observed elements belong to one component instance. */
    state: { callback: ResizeObserverCallback, targets: Set<Element> }
    /** Retain callback until owning component disconnects. */
    constructor(callback: ResizeObserverCallback) {
      this.state = { callback, targets: new Set() }
      observers.add(this.state)
    }

    /** Observe a mounted element. */
    observe = (target: Element) => this.state.targets.add(target)
    /** Stop observing a removed element. */
    unobserve = (target: Element) => this.state.targets.delete(target)
    /** Retire this component's notifications. */
    disconnect = () => observers.delete(this.state)
  })
  return {
    /** Publish current geometry through every active observer. */
    deliver() {
      for (const observer of observers) observer.callback([...observer.targets].map(target => ({ target, contentRect: target.getBoundingClientRect() }) as ResizeObserverEntry), {} as ResizeObserver)
    },
    /** Count active owners for teardown assertions. */
    count: () => observers.size,
    /** Inspect observation ownership when conditional elements are replaced. */
    targets: () => new Set([...observers].flatMap(observer => [...observer.targets])),
  }
}
