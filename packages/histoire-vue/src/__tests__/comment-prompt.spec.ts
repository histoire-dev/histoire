import { COMMENT_ATTACHMENT_LIMIT } from '@histoire/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentPrompt from '../../../histoire-app/src/app/components/comments/prompt/AgentPrompt.vue'
import { detectTrigger } from '../../../histoire-app/src/app/components/comments/prompt/suggestions.js'
import { commentAttachment } from '../../../histoire/src/node/__tests__/utils/comments.js'
import { commandAgents, pasteEvent, pngFile } from './utils/comment-prompt.js'

const attachment = commentAttachment()

/** Server double for file search and uploads. */
function stubServer() {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => ({
    ok: true,
    json: async () => url.includes('files/search') ? { files: [{ path: 'src/a/b.ts', basename: 'b.ts', dirname: 'src/a' }] } : attachment,
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

/** Prompt bound like its parents use it, mirroring v-model updates back into props. */
function mountPrompt(props: Record<string, unknown> = {}) {
  const wrapper = mount(AgentPrompt, {
    props: { 'modelValue': '', 'label': 'Message', 'placeholder': '', 'agents': commandAgents, 'agentId': 'claude', 'attachments': [], 'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }), 'onUpdate:attachments': (value: unknown[]) => wrapper.setProps({ attachments: value }), ...props },
    global: { stubs: { BuiltinIcon: true } },
    attachTo: document.body,
  })
  return wrapper
}

/** Type text with the caret at its end, as a user would. */
async function type(wrapper: ReturnType<typeof mountPrompt>, text: string) {
  const input = wrapper.get('textarea')
  await input.setValue(text)
  ;(input.element as HTMLTextAreaElement).setSelectionRange(text.length, text.length)
  await input.trigger('input')
}

/** Dispatch a cancelable key press on the field and return it. */
function press(wrapper: ReturnType<typeof mountPrompt>, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  wrapper.get('textarea').element.dispatchEvent(event)
  return event
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('prompt suggestion triggers', () => {
  it('detects mentions after whitespace and commands only at the start', () => {
    expect(detectTrigger('see @src/bu', 11)).toEqual({ char: '@', query: 'src/bu', start: 4, end: 11 })
    expect(detectTrigger('@', 1)).toEqual({ char: '@', query: '', start: 0, end: 1 })
    expect(detectTrigger('me@mail', 7)).toBeUndefined()
    expect(detectTrigger('see @a b', 8)).toBeUndefined()
    expect(detectTrigger('/rev', 4)).toEqual({ char: '/', query: 'rev', start: 0, end: 4 })
    expect(detectTrigger('fix /rev', 8)).toBeUndefined()
  })
})

describe('agent prompt suggestions', () => {
  it('debounces file search, ignores keys while a new query loads, then inserts the picked path', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fetch = stubServer()
    const wrapper = mountPrompt()
    try {
      await type(wrapper, 'Fix @')
      await type(wrapper, 'Fix @b')
      await vi.advanceTimersByTimeAsync(120)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ query: 'b' })
      await flushPromises()
      expect(wrapper.findAll('[role="option"]')).toHaveLength(1)
      // Stale rows of the previous query stay hidden and inert until the new search settles.
      await type(wrapper, 'Fix @src')
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
      expect(wrapper.get('textarea').attributes('aria-activedescendant')).toBeUndefined()
      expect(press(wrapper, { key: 'Enter' }).defaultPrevented).toBe(false)
      expect(wrapper.props('modelValue')).toBe('Fix @src')
      await vi.advanceTimersByTimeAsync(120)
      await flushPromises()
      expect(press(wrapper, { key: 'Enter' }).defaultPrevented).toBe(true)
      await flushPromises()
      expect(wrapper.props('modelValue')).toBe('Fix @src/a/b.ts ')
      expect(wrapper.emitted('send')).toBeUndefined()
    }
    finally { wrapper.unmount() }
  })

  it('lists the agent slash commands filtered by the typed name', async () => {
    const wrapper = mountPrompt()
    try {
      await type(wrapper, '/re')
      expect(wrapper.findAll('[role="option"]')).toHaveLength(1)
      await wrapper.get('textarea').trigger('keydown', { key: 'Tab' })
      expect(wrapper.props('modelValue')).toBe('/review ')
    }
    finally { wrapper.unmount() }
  })

  it('leaves keys to the input method while composing', async () => {
    const wrapper = mountPrompt()
    try {
      await type(wrapper, '/re')
      expect(press(wrapper, { key: 'Enter', isComposing: true }).defaultPrevented).toBe(false)
      expect(wrapper.props('modelValue')).toBe('/re')
      await type(wrapper, 'Ship it')
      press(wrapper, { key: 'Enter', ctrlKey: true, isComposing: true })
      expect(wrapper.emitted('send')).toBeUndefined()
    }
    finally { wrapper.unmount() }
  })

  it('explains an empty command list instead of showing nothing', async () => {
    const wrapper = mountPrompt({ agents: [{ id: 'claude', name: 'Claude Code', state: 'idle' }] })
    try {
      await type(wrapper, '/')
      expect(wrapper.get('[role="listbox"]').text()).toBe('No commands from Claude Code yet')
      expect(wrapper.find('[role="option"]').exists()).toBe(false)
    }
    finally { wrapper.unmount() }
  })
})

describe('agent prompt attachments', () => {
  it('uploads pasted files and shows them as removable chips', async () => {
    const fetch = stubServer()
    const wrapper = mountPrompt()
    try {
      const event = pasteEvent([pngFile()])
      wrapper.get('textarea').element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      await flushPromises()
      expect(fetch.mock.calls[0][0]).toContain('/__histoire/comments/attachments?name=a.png&type=image%2Fpng')
      expect(wrapper.props('attachments')).toEqual([attachment])
      await wrapper.get('button[aria-label="Remove a.png"]').trigger('click')
      expect(wrapper.props('attachments')).toEqual([])
    }
    finally { wrapper.unmount() }
  })

  it('pastes text normally when the clipboard also carries a file rendering', async () => {
    const fetch = stubServer()
    const wrapper = mountPrompt()
    try {
      const event = pasteEvent([pngFile()], 'A1\tB1')
      wrapper.get('textarea').element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      await flushPromises()
      expect(fetch).not.toHaveBeenCalled()
    }
    finally { wrapper.unmount() }
  })

  it('stops a batch at the attachment limit', async () => {
    const fetch = stubServer()
    const existing = Array.from({ length: COMMENT_ATTACHMENT_LIMIT - 1 }, (_, index) => commentAttachment({ path: `.histoire/attachments/${index}.png`, name: `${index}.png` }))
    const wrapper = mountPrompt({ attachments: existing })
    try {
      wrapper.get('textarea').element.dispatchEvent(pasteEvent([pngFile('x.png'), pngFile('y.png')]))
      await flushPromises()
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(wrapper.props('attachments')).toHaveLength(COMMENT_ATTACHMENT_LIMIT)
      expect(wrapper.get('[role="status"]').text()).toBe(`Attach at most ${COMMENT_ATTACHMENT_LIMIT} files`)
    }
    finally { wrapper.unmount() }
  })

  it('ignores dropped files while disabled', async () => {
    const fetch = stubServer()
    const wrapper = mountPrompt({ disabled: true })
    try {
      const event = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { files: [pngFile()], items: [], types: ['Files'] } })
      wrapper.get('.agent-prompt').element.dispatchEvent(event)
      await flushPromises()
      expect(fetch).not.toHaveBeenCalled()
    }
    finally { wrapper.unmount() }
  })

  it('attaches a captured screenshot on the capture shortcut', async () => {
    const fetch = stubServer()
    const capture = vi.fn(async () => '.histoire/screenshots/button--default--1-00000000-0000-0000-0000-000000000000.png')
    const wrapper = mountPrompt({ capture })
    try {
      expect(press(wrapper, { key: 'S', shiftKey: true, ctrlKey: true }).defaultPrevented).toBe(true)
      await flushPromises()
      expect(capture).toHaveBeenCalledOnce()
      expect(fetch.mock.calls[0][0]).toContain('/__histoire/comments/attachments/from-screenshot')
      expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ path: '.histoire/screenshots/button--default--1-00000000-0000-0000-0000-000000000000.png' })
      expect(wrapper.props('attachments')).toEqual([attachment])
    }
    finally { wrapper.unmount() }
  })

  it('opens the file picker on the attach shortcut', async () => {
    const wrapper = mountPrompt()
    try {
      const click = vi.spyOn(wrapper.get('input[type="file"]').element as HTMLInputElement, 'click').mockImplementation(() => {})
      expect(press(wrapper, { key: 'u', ctrlKey: true }).defaultPrevented).toBe(true)
      expect(click).toHaveBeenCalledOnce()
    }
    finally { wrapper.unmount() }
  })
})
