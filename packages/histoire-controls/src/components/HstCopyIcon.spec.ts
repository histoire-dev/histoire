import type { HistoireControlsHost } from '@histoire/shared'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import HstCopyIcon from './HstCopyIcon.vue'

/** Saves navigator properties changed by the clipboard fixture. */
let clipboardDescriptor: PropertyDescriptor | undefined
/** Saves navigator permission properties changed by the clipboard fixture. */
let permissionsDescriptor: PropertyDescriptor | undefined
/** Saves document command implementation changed by the clipboard fixture. */
let execCommandDescriptor: PropertyDescriptor | undefined

/** Installs deterministic browser clipboard and permission APIs for one test. */
function installClipboard(options: {
  writeText?: ReturnType<typeof vi.fn>
  permission?: PermissionState
} = {}) {
  const query = vi.fn().mockResolvedValue({
    state: options.permission ?? 'prompt',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  const writeText = options.writeText ?? vi.fn().mockResolvedValue(undefined)
  const execCommand = vi.fn().mockReturnValue(true)
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
  return { query, writeText, execCommand }
}

beforeEach(() => {
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  permissionsDescriptor = Object.getOwnPropertyDescriptor(navigator, 'permissions')
  execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand')
  window.__HST_CONTROLS_HOST__ = {
    open: vi.fn(() => ({ id: 'copy-tooltip', update: vi.fn(), close: vi.fn() })),
  } as unknown as HistoireControlsHost
})

afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else delete (navigator as unknown as Record<string, unknown>).clipboard
  if (permissionsDescriptor) Object.defineProperty(navigator, 'permissions', permissionsDescriptor)
  else delete (navigator as unknown as Record<string, unknown>).permissions
  if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor)
  else delete (document as unknown as Record<string, unknown>).execCommand
  delete window.__HST_CONTROLS_HOST__
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('hstCopyIcon clipboard lifecycle', () => {
  it('defers clipboard permission and success-tooltip setup for inactive copy actions', async () => {
    const clipboard = installClipboard()
    const addEventListener = vi.spyOn(EventTarget.prototype, 'addEventListener')
    const ManyCopyButtons = defineComponent({
      setup: () => () => h('div', Array.from({ length: 32 }, (_, index) => h(HstCopyIcon, { key: index, content: `Token ${index}` }))),
    })
    const wrapper = mount(ManyCopyButtons)
    try {
      await nextTick()
      const icons = new Set(wrapper.findAll('svg').map(icon => icon.element))
      const tooltipListeners = addEventListener.mock.calls.filter(([type], index) =>
        icons.has(addEventListener.mock.contexts[index] as SVGElement)
        && ['mouseenter', 'mouseleave', 'focusin', 'focusout'].includes(String(type)),
      )
      expect(clipboard.query).not.toHaveBeenCalled()
      expect(tooltipListeners).toHaveLength(0)
      expect(clipboard.writeText).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
    }
  })

  it('resolves asynchronous content on click and keeps copied feedback local to each button', async () => {
    const clipboard = installClipboard()
    const produceContent = vi.fn(async () => 'current token value')
    const first = mount(HstCopyIcon, { props: { content: produceContent, label: 'Copy token' } })
    const second = mount(HstCopyIcon, { props: { content: 'other value' } })
    try {
      expect(first.get('button').attributes('aria-label')).toBe('Copy token')
      await first.get('button').trigger('click')
      await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('current token value'))
      await vi.waitFor(() => expect(first.get('button').attributes('aria-label')).toBe('Copied'))
      expect(produceContent).toHaveBeenCalledOnce()
      expect(second.get('button').attributes('aria-label')).toBe('Copy')
      expect(clipboard.writeText).toHaveBeenCalledOnce()
    }
    finally {
      first.unmount()
      second.unmount()
    }
  })

  it('reports asynchronous content failures without attempting clipboard writes', async () => {
    const clipboard = installClipboard()
    const failure = new Error('Content unavailable')
    const errorHandler = vi.fn()
    const wrapper = mount(HstCopyIcon, {
      props: { content: async () => { throw failure } },
      global: { config: { errorHandler } },
    })
    try {
      await wrapper.get('button').trigger('click')
      await vi.waitFor(() => expect(errorHandler).toHaveBeenCalled())
      expect(errorHandler.mock.calls[0][0]).toBe(failure)
      expect(clipboard.writeText).not.toHaveBeenCalled()
      expect(wrapper.get('button').attributes('aria-label')).toBe('Copy')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('resets only its own copied feedback after the existing interval', async () => {
    const clipboard = installClipboard()
    vi.useFakeTimers()
    const first = mount(HstCopyIcon, { props: { content: 'value' } })
    const second = mount(HstCopyIcon, { props: { content: 'other' } })
    try {
      await first.get('button').trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      expect(clipboard.writeText).toHaveBeenCalledWith('value')
      expect(first.get('button').attributes('aria-label')).toBe('Copied')
      expect(second.get('button').attributes('aria-label')).toBe('Copy')
      await vi.advanceTimersByTimeAsync(1500)
      await nextTick()
      expect(first.get('button').attributes('aria-label')).toBe('Copy')
      expect(second.get('button').attributes('aria-label')).toBe('Copy')
    }
    finally {
      first.unmount()
      second.unmount()
    }
  })

  it('retains legacy copy fallback after a supported clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard denied'))
    const clipboard = installClipboard({ writeText })
    const wrapper = mount(HstCopyIcon, { props: { content: 'fallback value' } })
    try {
      await wrapper.get('button').trigger('click')
      await vi.waitFor(() => expect(clipboard.execCommand).toHaveBeenCalledWith('copy'))
      expect(clipboard.writeText).toHaveBeenCalledWith('fallback value')
      expect(document.querySelector('textarea')).toBeNull()
      await vi.waitFor(() => expect(wrapper.get('button').attributes('aria-label')).toBe('Copied'))
    }
    finally {
      wrapper.unmount()
    }
  })

  it('preserves silent no-op behavior when the Clipboard API is unsupported', async () => {
    const clipboard = installClipboard()
    delete (navigator as unknown as Record<string, unknown>).clipboard
    const wrapper = mount(HstCopyIcon, { props: { content: 'unsupported value' } })
    try {
      await wrapper.get('button').trigger('click')
      expect(clipboard.writeText).not.toHaveBeenCalled()
      expect(clipboard.execCommand).not.toHaveBeenCalled()
      expect(wrapper.get('button').attributes('aria-label')).toBe('Copy')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not initialize clipboard access when an asynchronous producer settles after unmount', async () => {
    const clipboard = installClipboard()
    let resolveContent!: (value: string) => void
    const content = () => new Promise<string>((resolve) => {
      resolveContent = resolve
    })
    const wrapper = mount(HstCopyIcon, { props: { content } })
    await wrapper.get('button').trigger('click')
    wrapper.unmount()

    resolveContent('retired value')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(clipboard.query).not.toHaveBeenCalled()
    expect(clipboard.writeText).not.toHaveBeenCalled()
  })

  it('does not start fallback or copied feedback after an in-flight write settles on unmount', async () => {
    let resolveWrite!: () => void
    const writeText = vi.fn(() => new Promise<void>((resolve) => {
      resolveWrite = resolve
    }))
    const clipboard = installClipboard({ writeText })
    const wrapper = mount(HstCopyIcon, { props: { content: 'in-flight value' } })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    wrapper.unmount()
    vi.useFakeTimers()

    resolveWrite()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    expect(clipboard.execCommand).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not fall back after an in-flight write rejects on unmount', async () => {
    let rejectWrite!: (error: Error) => void
    const writeText = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectWrite = reject
    }))
    const clipboard = installClipboard({ writeText })
    const wrapper = mount(HstCopyIcon, { props: { content: 'in-flight value' } })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    wrapper.unmount()
    vi.useFakeTimers()

    rejectWrite(new Error('Clipboard denied'))
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    expect(clipboard.execCommand).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps its exposed focus handle independent from clipboard access', () => {
    const clipboard = installClipboard()
    const wrapper = mount(HstCopyIcon, { attachTo: document.body, props: { content: 'value' } })
    try {
      const button = wrapper.get('button').element
      ;(wrapper.vm as unknown as { focus: () => void }).focus()
      expect(document.activeElement).toBe(button)
      expect(clipboard.query).not.toHaveBeenCalled()
      expect(clipboard.writeText).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
    }
  })
})
