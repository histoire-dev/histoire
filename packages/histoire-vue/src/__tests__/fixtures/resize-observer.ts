import { vi } from 'vitest'

/** Deliver controlled native resize notifications without duplicating observer stubs. */
export function resizeObserverFixture() {
  const observers = new Set<{ callback: ResizeObserverCallback, targets: Set<Element> }>()
  const history = new Set<{ callback: ResizeObserverCallback, targets: Set<Element> }>()
  vi.stubGlobal('ResizeObserver', class {
    /** Callback and observed elements belong to one component instance. */
    state: { callback: ResizeObserverCallback, targets: Set<Element> }
    /** Keep callback history for queued-notification lifecycle tests. */
    constructor(callback: ResizeObserverCallback) {
      this.state = { callback, targets: new Set() }
      observers.add(this.state)
      history.add(this.state)
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
    /** Invoke retained callbacks to model notifications queued before disconnect. */
    notifyAll(entries: ResizeObserverEntry[]) {
      for (const observer of history) observer.callback(entries, {} as ResizeObserver)
    },
    /** Invoke one retained observer callback by creation order. */
    notifyObserver(index: number, entries: ResizeObserverEntry[]) {
      const observer = [...history][index]
      observer?.callback(entries, {} as ResizeObserver)
    },
  }
}
