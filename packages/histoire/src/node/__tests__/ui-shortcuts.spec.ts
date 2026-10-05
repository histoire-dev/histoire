import { describe, expect, it, vi } from 'vitest'
import { registerCanvasShortcuts } from '../../../../histoire-app/src/app/components/canvas/toolbar/shortcuts.js'
import { createCanvasFrames } from '../../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { createShortcutRegistry } from '../../../../histoire-app/src/app/util/shortcuts.js'

/** Minimal native-event projection keeps registry tests independent of DOM. */
function keyboard(key: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { key, code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, repeat: false, target: null, preventDefault: vi.fn(), ...modifiers } as unknown as KeyboardEvent
}

describe('workbench shortcut registry', () => {
  it('rejects equivalent bindings in same scope and permits different scopes', () => {
    const registry = createShortcutRegistry()
    registry.register({ id: 'search', label: 'Search', keys: ['mod+k'], scope: 'global', handler: vi.fn() })
    expect(() => registry.register({ id: 'duplicate', label: 'Duplicate', keys: ['MOD+K'], scope: 'global', handler: vi.fn() })).toThrow('Duplicate shortcut binding')
    expect(() => registry.register({ id: 'control', label: 'Control', keys: ['ctrl+k'], scope: 'global', handler: vi.fn() })).toThrow('Duplicate shortcut binding')
    expect(() => registry.register({ id: 'canvas', label: 'Canvas', keys: ['mod+k'], scope: 'canvas', handler: vi.fn() })).not.toThrow()
  })

  it('matches platform modifiers, ignores extra modifiers and gates dev actions', () => {
    const registry = createShortcutRegistry()
    const search = vi.fn()
    const editor = vi.fn()
    registry.register({ id: 'search', label: 'Search', keys: ['mod+k'], scope: 'global', handler: search })
    registry.register({ id: 'editor', label: 'Editor', keys: ['mod+e'], scope: 'global', devOnly: true, handler: editor })
    expect(registry.handle(keyboard('k', { metaKey: true }), ['global'], false)).toBe(true)
    expect(registry.handle(keyboard('k', { ctrlKey: true }), ['global'], false)).toBe(true)
    expect(registry.handle(keyboard('k', { metaKey: true, shiftKey: true }), ['global'], false)).toBe(false)
    expect(registry.handle(keyboard('e', { metaKey: true }), ['global'], false)).toBe(false)
    expect(search).toHaveBeenCalledTimes(2)
    expect(editor).not.toHaveBeenCalled()
  })

  it('uses physical digit keys for Shift zoom shortcuts and releases registrations', () => {
    const registry = createShortcutRegistry()
    const fit = vi.fn()
    const remove = registry.register({ id: 'fit', label: 'Fit', keys: ['shift+1'], scope: 'canvas', handler: fit })
    expect(registry.handle(keyboard('!', { code: 'Digit1', shiftKey: true }), ['canvas'], true)).toBe(true)
    remove()
    expect(registry.handle(keyboard('!', { code: 'Digit1', shiftKey: true }), ['canvas'], true)).toBe(false)
    expect(fit).toHaveBeenCalledOnce()
  })

  it('keeps shortcut reference after unmount without retaining retired handlers', () => {
    const registry = createShortcutRegistry()
    const fit = vi.fn()
    const remove = registry.bind('canvas.fit', fit)
    remove()
    expect(registry.reference.get('canvas.fit')?.keys).toEqual(['shift+1'])
    expect(registry.entries.has('canvas.fit')).toBe(false)
    expect(registry.handle(keyboard('!', { code: 'Digit1', shiftKey: true }), ['canvas'], true)).toBe(false)
    const replacement = vi.fn()
    registry.bind('canvas.fit', replacement)
    expect(registry.handle(keyboard('!', { code: 'Digit1', shiftKey: true }), ['canvas'], true)).toBe(true)
    expect(fit).not.toHaveBeenCalled()
    expect(replacement).toHaveBeenCalledOnce()
  })

  it('switches canvas tools with H/V while preserving editable input and scope ownership', () => {
    const registry = createShortcutRegistry()
    const canvas = createCanvasStore()
    const remove = registerCanvasShortcuts(registry, canvas, createCanvasFrames(canvas))
    expect(registry.handle(keyboard('h'), ['canvas'], false)).toBe(true)
    expect(canvas.tool).toBe('pan')
    expect(registry.handle(keyboard('v'), ['global'], false)).toBe(false)
    expect(registry.handle(keyboard('v', { target: { closest: () => ({}) } as unknown as EventTarget }), ['canvas'], false)).toBe(false)
    expect(canvas.tool).toBe('pan')
    expect(registry.handle(keyboard('v'), ['canvas'], false)).toBe(true)
    expect(canvas.tool).toBe('select')
    remove()
    expect(registry.handle(keyboard('h'), ['canvas'], false)).toBe(false)
    expect(canvas.tool).toBe('select')
  })

  it('selects Measure with M only for eligible frame and leaves through V/H', () => {
    const registry = createShortcutRegistry()
    const canvas = createCanvasStore()
    const frames = createCanvasFrames(canvas)
    const remove = registerCanvasShortcuts(registry, canvas, frames)
    canvas.selectedFrame = 'frame'
    expect(registry.handle(keyboard('m'), ['canvas'], false)).toBe(false)
    const iframe = { src: 'https://book.test/preview', contentWindow: {}, ownerDocument: { defaultView: { location: { href: 'https://book.test/', origin: 'https://book.test' } } } } as HTMLIFrameElement
    frames.registerFrame({ id: 'frame', storyId: 'story', variantId: 'variant', iframe, documentId: 'document', rect: { x: 0, y: 0, width: 720, height: 640 } })
    try {
      for (const event of [keyboard('m', { shiftKey: true }), keyboard('m', { repeat: true }), keyboard('m', { target: { closest: () => ({}) } as unknown as EventTarget })]) {
        expect(registry.handle(event, ['canvas'], false)).toBe(false)
      }
      expect(registry.handle(keyboard('m'), ['global'], false)).toBe(false)
      expect(canvas.tool).toBe('select')
      expect(registry.handle(keyboard('m'), ['canvas'], false)).toBe(true)
      expect(registry.handle(keyboard('m'), ['canvas'], false)).toBe(true)
      expect(canvas.tool).toBe('measure')
      expect(registry.hint('canvas.measure')).toBe('M')
      expect(registry.handle(keyboard('v'), ['canvas'], false)).toBe(true)
      expect(canvas.tool).toBe('select')
      registry.handle(keyboard('m'), ['canvas'], true)
      registry.handle(keyboard('h'), ['canvas'], true)
      expect(canvas.tool).toBe('pan')
      frames.getFrame('frame')!.documentId = null
      expect(registry.handle(keyboard('m'), ['canvas'], true)).toBe(false)
      expect(canvas.tool).toBe('pan')
    }
    finally { remove() }
    expect(registry.handle(keyboard('m'), ['canvas'], false)).toBe(false)
    expect(registry.reference.get('canvas.measure')?.keys).toEqual(['m'])
  })
})
