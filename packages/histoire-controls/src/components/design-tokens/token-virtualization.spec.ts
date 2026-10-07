import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import HstTokenGrid from './HstTokenGrid.vue'
import HstTokenList from './HstTokenList.vue'

const largeTokens = Object.fromEntries(Array.from({ length: 2000 }, (_, index) => [`token-${index}`, `${index}px`]))
const observers: TestResizeObserver[] = []
let rootWidth = 400
let scrollY = 0
let offscreenActionKey: string | undefined
let scrollIntoViewDescriptor: PropertyDescriptor | undefined

/** Deliver deterministic root and variable-row geometry to the native-scroll component. */
class TestResizeObserver implements ResizeObserver {
  readonly observed = new Set<Element>()
  readonly disconnect = vi.fn(() => this.observed.clear())
  readonly observe = vi.fn((element: Element): void => { this.observed.add(element) })
  readonly unobserve = vi.fn((element: Element): void => { this.observed.delete(element) })

  /** Keep callback exact to the browser observer signature. */
  constructor(private readonly callback: ResizeObserverCallback) {
    observers.push(this)
  }

  /** Deliver current measured geometry for selected targets. */
  deliver(targets: Iterable<Element> = this.observed): void {
    const entries = [...targets].map((target) => {
      const isRoot = target instanceof HTMLElement && target.dataset.tokenVirtualRoot !== undefined
      const key = target instanceof HTMLElement ? target.dataset.tokenVirtualRow ?? '' : ''
      const index = Number(key.match(/token-(\d+)/)?.[1] ?? 0)
      const height = 48 + index % 5 * 24
      return {
        target,
        contentRect: {
          width: isRoot ? rootWidth : 180,
          height: isRoot ? 0 : height,
        } as DOMRectReadOnly,
      } as ResizeObserverEntry
    })
    this.callback(entries, this)
  }
}

/** Install iframe-like viewport geometry while leaving native document scrolling enabled. */
function installViewport(width = 400, height = 240) {
  rootWidth = width
  scrollY = 0
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => rootWidth })
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => height })
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (offscreenActionKey && this.dataset.tokenAction === offscreenActionKey) return makeRect(rootWidth, 24, -24)
    if (this.dataset.tokenVirtualRoot !== undefined) return makeRect(rootWidth, 0, -scrollY)
    if (this.dataset.tokenVirtualRow) {
      const index = Number(this.dataset.tokenVirtualRow.match(/token-(\d+)/)?.[1] ?? 0)
      return makeRect(rootWidth, 48 + index % 5 * 24, -scrollY)
    }
    return originalRect.call(this)
  })
  return {
    /** Move the native document position without creating an internal scroll box. */
    scrollTo(offset: number) {
      scrollY = offset
      window.dispatchEvent(new Event('scroll'))
    },
    /** Change width and notify the component's measured root observer. */
    resizeTo(width: number) {
      rootWidth = width
      observers[0]?.deliver([document.querySelector('[data-token-virtual-root]')!])
    },
  }
}

/** Minimal rectangle accepted by DOM measurement APIs in jsdom. */
function makeRect(width: number, height: number, top: number): DOMRect {
  return { x: 0, y: top, top, left: 0, right: width, bottom: top + height, width, height, toJSON: () => ({}) }
}

afterEach(() => {
  observers.splice(0)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  offscreenActionKey = undefined
  if (scrollIntoViewDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor)
    scrollIntoViewDescriptor = undefined
  }
  else {
    delete (HTMLElement.prototype as any).scrollIntoView
  }
  for (const key of ['innerWidth', 'innerHeight', 'scrollY'] as const) delete (window as any)[key]
})

describe('opt-in token virtualization', () => {
  it.each([HstTokenGrid, HstTokenList])('bounds mounted samples and supports filtering to the last token', async (component) => {
    installViewport()
    const observed = new Map<string, unknown>()
    const wrapper = mount(component, {
      props: { tokens: largeTokens, virtualize: true, search: '' },
      global: { stubs: { HstTokenDetails: true } },
      slots: {
        default: ({ token }: { token: { key: string, value: unknown } }) => {
          observed.set(token.key, token.value)
          return h('span', { 'data-token-sample': token.key }, 'sample')
        },
      },
    })

    try {
      await nextTick()
      expect(wrapper.findAll('[data-token-sample]').length).toBeLessThan(64)

      await wrapper.setProps({ search: 'token-1999' })
      expect(wrapper.findAll('[data-token-sample]').map(sample => sample.attributes('data-token-sample'))).toEqual(['token-1999'])
      expect(observed.get('token-1999')).toBe('1999px')

      await wrapper.setProps({ search: '' })
      expect(wrapper.findAll('[data-token-sample]').length).toBeLessThan(64)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps retained row observer registrations stable across rerenders and scroll updates', async () => {
    const viewport = installViewport()
    const wrapper = mount(HstTokenGrid, {
      props: { tokens: largeTokens, virtualize: true, colSize: 180 },
      global: { stubs: { HstTokenDetails: true } },
      slots: { default: ({ token }: { token: { key: string } }) => h('span', token.key) },
    })

    try {
      await nextTick()
      const observer = observers[0]
      const retainedRows = Array.from(observer.observed).filter(element => element instanceof HTMLElement && element.dataset.tokenVirtualRow)
      const observedCalls = observer.observe.mock.calls.length
      const unobservedCalls = observer.unobserve.mock.calls.length
      expect(retainedRows.length).toBeGreaterThan(0)

      await wrapper.setProps({ colSize: 181 })
      viewport.scrollTo(1)
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
      await nextTick()

      expect(observer.observe).toHaveBeenCalledTimes(observedCalls)
      expect(observer.unobserve).toHaveBeenCalledTimes(unobservedCalls)
      expect(retainedRows.every(row => observer.observed.has(row))).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('retains focus across responsive reflow and pins focused row while native scroll reaches the end', async () => {
    const viewport = installViewport(400, 240)
    const wrapper = mount(HstTokenGrid, {
      attachTo: document.body,
      props: { tokens: largeTokens, virtualize: true, colSize: 180 },
      global: { stubs: { HstTokenDetails: { template: '<div><button>Name</button><button>Value</button></div>' } } },
      slots: {
        default: ({ token }: { token: { key: string } }) => h('button', { 'data-token-action': token.key }, token.key),
      },
    })

    try {
      await nextTick()
      observers[0]?.deliver()
      await nextTick()
      const firstAction = wrapper.find('[data-token-action="token-0"]').element as HTMLButtonElement
      firstAction.focus()
      expect(document.activeElement).toBe(firstAction)

      viewport.resizeTo(720)
      await nextTick()
      await nextTick()
      const reflowedAction = wrapper.find('[data-token-action="token-0"]').element
      expect(document.activeElement).toBe(reflowedAction)
      expect(wrapper.find('[data-token-virtual-row]').findAll('[data-token-virtual-key]')).toHaveLength(3)

      viewport.scrollTo(1000000)
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
      await nextTick()
      expect(document.activeElement).toBe(reflowedAction)
      expect(wrapper.find('[data-token-action="token-1999"]').exists()).toBe(true)
      expect(wrapper.findAll('[data-token-action]').length).toBeLessThan(64)
      expect(wrapper.find('[data-token-virtual-spacer="gap"]').exists()).toBe(true)

      const observer = observers[0]
      wrapper.unmount()
      expect(observer.disconnect).toHaveBeenCalledTimes(1)
    }
    finally {
      if (wrapper.exists()) wrapper.unmount()
    }
  })

  it('keeps deep-token focus visible when responsive reflow moves its row', async () => {
    const viewport = installViewport(400, 240)
    const scrollIntoView = vi.fn()
    scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const wrapper = mount(HstTokenGrid, {
      attachTo: document.body,
      props: { tokens: largeTokens, virtualize: true, colSize: 180 },
      global: { stubs: { HstTokenDetails: true } },
      slots: { default: ({ token }: { token: { key: string } }) => h('button', { 'data-token-action': token.key }, token.key) },
    })

    try {
      await nextTick()
      viewport.scrollTo(60000)
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
      await nextTick()
      const oldAction = wrapper.find('[data-token-action="token-520"]').element as HTMLButtonElement
      expect(oldAction).toBeTruthy()
      offscreenActionKey = 'token-520'
      oldAction.focus()

      viewport.resizeTo(720)
      await nextTick()
      await nextTick()

      const restoredAction = wrapper.find('[data-token-action="token-520"]').element
      expect(document.activeElement).toBe(restoredAction)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
      expect(wrapper.find('[data-token-virtual-row]').exists()).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps generic token stories fully rendered unless virtualization is requested', () => {
    const tokens = Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`token-${index}`, index]))
    const wrapper = mount(HstTokenGrid, {
      props: { tokens },
      global: { stubs: { HstTokenDetails: true } },
      slots: { default: ({ token }: { token: { key: string } }) => h('span', { 'data-token-sample': token.key }) },
    })

    try {
      expect(wrapper.findAll('[data-token-sample]')).toHaveLength(80)
    }
    finally {
      wrapper.unmount()
    }
  })
})
