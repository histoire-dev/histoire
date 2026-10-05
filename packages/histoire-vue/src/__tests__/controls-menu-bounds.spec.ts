import { expect, it, vi } from 'vitest'
import { observeControlsMenuBounds } from '../overlays/menu-bounds.js'

it('bounds choices by owning popper content box without feeding back the measured menu height', () => {
  const inner = document.createElement('div')
  inner.className = 'v-popper__inner'
  const slot = inner.appendChild(document.createElement('div'))
  const list = slot.appendChild(document.createElement('div'))
  let maxHeight = '428.5px'
  const read = vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ maxHeight, borderTopWidth: '1px', borderBottomWidth: '1px' }) as CSSStyleDeclaration)
  const height = vi.fn()
  const owner = observeControlsMenuBounds(list, height)
  try {
    expect(height).toHaveBeenLastCalledWith(426)
    Object.defineProperty(inner, 'clientHeight', { value: 10 })
    owner.update()
    expect(height).toHaveBeenCalledOnce()
    maxHeight = '200.9px'
    owner.update()
    expect(height).toHaveBeenLastCalledWith(198)
    maxHeight = 'none'
    owner.update()
    // FloatingVue clears its limit while computing the next position. Growing
    // the list during that gap resets scrollTop and hides its focused choice.
    expect(height).toHaveBeenLastCalledWith(198)
    expect(height).toHaveBeenCalledTimes(2)
    maxHeight = '350.9px'
    owner.update()
    expect(height).toHaveBeenLastCalledWith(348)
  }
  finally {
    owner.close()
    read.mockRestore()
  }
})

it('observes only owning shell, disconnects once, and ignores callbacks after close', () => {
  const inner = document.createElement('div')
  inner.className = 'v-popper__inner'
  const list = inner.appendChild(document.createElement('div'))
  const callbacks: (() => void)[] = []
  const observe = vi.fn()
  const disconnect = vi.fn()
  const observer = class {
    constructor(callback: () => void) { callbacks.push(callback) }
    observe = observe
    disconnect = disconnect
  }
  vi.stubGlobal('ResizeObserver', observer)
  vi.stubGlobal('MutationObserver', observer)
  const read = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ maxHeight: '300px', borderTopWidth: '0px', borderBottomWidth: '0px' } as CSSStyleDeclaration)
  const height = vi.fn()
  const owner = observeControlsMenuBounds(list, height)
  try {
    expect(observe.mock.calls.every(([target]) => target === inner)).toBe(true)
    owner.close()
    owner.close()
    expect(disconnect).toHaveBeenCalledTimes(2)
    callbacks.forEach(callback => callback())
    owner.update()
    expect(height).toHaveBeenCalledOnce()
  }
  finally {
    owner.close()
    read.mockRestore()
    vi.unstubAllGlobals()
  }
})
