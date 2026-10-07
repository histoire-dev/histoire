import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { createContextMenu } from '../../../../histoire-app/src/app/composables/context-menu.js'
import { createFrameActions } from '../../../../histoire-app/src/app/util/frame-actions.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/session/controller.js'

describe('workbench frame actions', () => {
  it('sends only the selected story target when opening a captured frame in the editor', async () => {
    const fixture = sourceFixture()
    fixture.request.mockImplementation(async command => command === 'openInEditor' ? null : undefined)
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const error = vi.fn()
    const actions = createFrameActions({ session, link: () => '', reveal: vi.fn(), error })
    const target = { storyId: 'a:b', variantId: 'c', frameKey: 'captured-frame' }

    try {
      await actions.run(actions.entries.get('open-editor')!, target)
      expect(error).not.toHaveBeenCalled()
      expect(fixture.request).toHaveBeenCalledWith('openInEditor', { storyId: 'a:b', variantId: 'c' }, expect.any(Object))
    }
    finally { await session.dispose() }
  })

  it.each(['generated', 'external'] as const)('hides editor action for %s story files', async (fileOrigin) => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories[0].fileOrigin = fileOrigin
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const actions = createFrameActions({ session, link: () => '', reveal: vi.fn() })
    const target = { storyId: 'a:b', variantId: 'c', frameKey: 'frame' }
    try {
      expect(actions.list(target).map(action => action.id)).not.toContain('open-editor')
      await actions.run(actions.entries.get('open-editor')!, target)
      expect(fixture.request).not.toHaveBeenCalledWith('openInEditor', expect.anything(), expect.anything())
    }
    finally { await session.dispose() }
  })

  it.each(['One', 'JSON {', 'State {value}', 'A & "quoted" <value> {literal}'])('saves Svelte source with literal title %s without serializing state', async (title) => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories[0].supportPluginId = '@histoire/plugin-svelte'
    fixture.descriptor.catalog.stories[0].variants[0].title = title
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount({} as HTMLElement, { surface: 'preview' }).ready
    const copy = vi.fn(async (_text: string) => {})
    const actions = createFrameActions({ session, copy, link: () => '', reveal: vi.fn() })
    const svelte = createRequire(new URL('../../../../../examples/svelte4/package.json', import.meta.url))('svelte/compiler')
    try {
      await actions.run(actions.entries.get('save-props')!, { storyId: 'a:b', variantId: 'c', frameKey: 'frame' })
      const text = copy.mock.calls[0]?.[0]
      expect(text).toBeTruthy()
      expect(() => svelte.parse(text)).not.toThrow()
      const wrapper = svelte.parse(text).html.children[0]
      expect(wrapper.name).toBe('Hst.Variant')
      const titleAttribute = wrapper.attributes.find(attribute => attribute.name === 'title')
      expect(titleAttribute.value.every(part => part.type === 'Text')).toBe(true)
      expect(titleAttribute.value.map(part => part.data).join('')).toBe(title)
      expect(text).toContain('\n  source\n')
      expect(fixture.request).toHaveBeenCalledWith('source.get', { storyId: 'a:b', variantId: 'c', mode: 'dynamic' }, expect.objectContaining({ runtimeId: 'document-1' }))
      expect(fixture.request.mock.calls.some(([command]) => command === 'state.get')).toBe(false)
    }
    finally { await session.dispose() }
  })

  it('captures right-clicked frame without mutating selection and restores chrome focus', () => {
    const menu = createContextMenu()
    const focus = vi.fn()
    const event = { clientX: 50, clientY: 80, preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: { focus, getBoundingClientRect: () => ({ left: 20, top: 40 }) } } as unknown as MouseEvent
    const target = { storyId: 'a:b', variantId: 'other', frameKey: 'other-frame' }
    menu.open(event, target)
    expect(menu.state.target).toEqual(target)
    expect(menu.state.x).toBe(50)
    menu.close(true)
    expect(focus).toHaveBeenCalledOnce()
    expect(menu.state.target).toBeNull()
  })

  it('captures virtual context targets and runs actions against their copied identity', async () => {
    const menu = createContextMenu()
    const run = vi.fn()
    const action = { id: 'folder.expand', label: 'Expand folder', icon: 'folder-open', run }
    menu.register(action)
    const path = ['components']
    const target = { kind: 'folder' as const, label: 'components', key: 'folder:components', path, expanded: false }
    const focus = vi.fn()
    const event = { key: 'ContextMenu', preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: { focus, getBoundingClientRect: () => ({ left: 20, top: 40 }) } } as unknown as KeyboardEvent

    expect(menu.open(event, target, [action.id])).toBe(true)
    path.push('recycled')
    expect(menu.state.context).toMatchObject({ kind: 'folder', path: ['components'], expanded: false })
    expect(menu.state.x).toBe(36)
    await menu.run(action, menu.state.context!)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ kind: 'folder', path: ['components'] }))
    menu.close(true)
    expect(focus).toHaveBeenCalledOnce()
  })

  it('leaves nested iframe context menus native', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'Element')
    class IframeElement {
      closest(selector: string) {
        expect(selector.split(', ')).toContain('iframe')
        return this
      }
    }
    Object.defineProperty(globalThis, 'Element', { configurable: true, value: IframeElement })
    try {
      const menu = createContextMenu()
      const iframe = new IframeElement()
      const event = { target: iframe, preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: {} } as unknown as MouseEvent

      expect(menu.open(event, { storyId: 'story', variantId: 'variant', frameKey: 'frame' })).toBe(false)
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(event.stopPropagation).not.toHaveBeenCalled()
      expect(menu.state.context).toBeNull()
    }
    finally {
      if (previous) Object.defineProperty(globalThis, 'Element', previous)
      else Reflect.deleteProperty(globalThis, 'Element')
    }
  })

  it('copies exact context target through same session source service as source panel', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const copy = vi.fn(async () => {})
    const actions = createFrameActions({ session, copy, link: target => `https://book.example/#/story/${target.storyId}?variantId=${target.variantId}`, reveal: vi.fn() })
    const target = { storyId: 'a:b', variantId: 'other', frameKey: 'other-frame' }
    try {
      await actions.run(actions.entries.get('copy-source')!, target)
      expect(fixture.request).toHaveBeenCalledWith('source.get', expect.objectContaining({ storyId: 'a:b', variantId: 'other', mode: 'raw' }), expect.anything())
      expect(copy).toHaveBeenCalledWith('source')
      expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
    }
    finally { await session.dispose() }
  })

  it('hides dev/capability actions and preserves copy text when clipboard fails', async () => {
    const fixture = sourceFixture()
    fixture.descriptor.mode = 'static'
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const target = { storyId: 'a:b', variantId: 'c', frameKey: 'frame' }
    const actions = createFrameActions({ session, copy: async () => {
      throw new Error('Denied')
    }, link: () => 'canonical link', reveal: vi.fn() })
    actions.registerFrameAction({ id: 'screenshot', label: 'Screenshot', icon: 'camera', available: () => false, run: vi.fn() })
    try {
      expect(actions.list(target).map(action => action.id)).not.toContain('open-editor')
      expect(actions.list(target).map(action => action.id)).not.toContain('run-tests')
      expect(actions.list(target).map(action => action.id)).not.toContain('screenshot')
      await actions.run(actions.entries.get('copy-link')!, target)
      expect(actions.manualCopy.value).toBe('canonical link')
    }
    finally { await session.dispose() }
  })
})
