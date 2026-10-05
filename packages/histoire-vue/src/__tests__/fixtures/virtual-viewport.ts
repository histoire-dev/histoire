import { vi } from 'vitest'

/** Supply viewport geometry; delayed events model native scroll delivery after rendering. */
export function virtualViewport(delayedScroll = false) {
  const pending = new Set<Element>()
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 240, width: 320, height: 240, toJSON: () => ({}) }))
  const setScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')?.set
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
    setScrollTop?.call(this, value)
    if (delayedScroll) pending.add(this)
    else this.dispatchEvent(new Event('scroll'))
  })
  return {
    /** Release native events independently of Vue's mounted row flush. */
    deliverScroll() {
      for (const element of pending) element.dispatchEvent(new Event('scroll'))
      pending.clear()
    },
  }
}
