import { describe, expect, it, vi } from 'vitest'
import { effect } from 'vue'
import { createCanvasFrames } from '../../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore, getCanvasStorage } from '../../../../histoire-app/src/app/stores/canvas.js'

describe('canvas frame registry', () => {
  it('converts transformed pointer coordinates and addresses current same-origin document', () => {
    const registry = createCanvasFrames(createCanvasStore())
    const postMessage = vi.fn()
    const iframe = { contentWindow: { postMessage }, ownerDocument: { defaultView: { location: { origin: 'https://book.test' } } }, getBoundingClientRect: () => ({ left: 100, top: 200, width: 200, height: 120 }) } as unknown as HTMLIFrameElement
    registry.registerFrame({ id: 'frame', storyId: 'story', variantId: 'variant', rect: { x: 0, y: 0, width: 1000, height: 600 }, iframe, documentId: 'current' })
    expect(registry.clientToFrame('frame', { x: 150, y: 230 })).toEqual({ x: 250, y: 150 })
    expect(registry.frameToClient('frame', { x: 250, y: 150 })).toEqual({ x: 150, y: 230 })
    expect(registry.postToFrame('frame', { type: 'request', documentId: 'wrong' })).toBe(true)
    expect(postMessage).toHaveBeenCalledWith({ type: 'request', __histoire: true, documentId: 'current' }, 'https://book.test')
    expect(registry.postToFrame('absent', { type: 'request' })).toBe(false)
  })

  it('publishes readiness mutation and prevents retired cleanup deleting successor', () => {
    const registry = createCanvasFrames(createCanvasStore())
    const original = registry.registerFrame({ id: 'frame', storyId: 'story', variantId: 'variant', rect: { x: 0, y: 0, width: 1, height: 1 } })
    let ready = false
    effect(() => {
      ready = !!registry.getFrame('frame')?.documentId
    })
    registry.getFrame('frame')!.documentId = 'ready'
    expect(ready).toBe(true)
    registry.registerFrame({ id: 'frame', storyId: 'story', variantId: 'variant', rect: { x: 0, y: 0, width: 2, height: 2 } })
    original()
    expect(registry.getFrame('frame')?.rect.width).toBe(2)
  })
})

describe('canvas preference ownership', () => {
  it('keeps memory-only canvas usable when browser storage getter is blocked', () => {
    const blocked = Object.defineProperty({}, 'localStorage', { get() {
      throw new Error('Storage denied')
    } }) as Window
    const storage = getCanvasStorage(blocked)
    expect(storage).toBeUndefined()
    const canvas = createCanvasStore({ storage })
    canvas.setZoom(2)
    expect(canvas.effectiveZoom).toBe(2)
  })

  it('clamps saved zoom and persists preferences without pan or selected target', () => {
    const setItem = vi.fn()
    const store = createCanvasStore({ storage: { getItem: () => '{"zoom":99,"tool":"pan","measure":true,"frameBackground":"white"}', setItem } })
    expect(store.zoom).toBe(4)
    expect(store.tool).toBe('measure')
    expect(setItem).not.toHaveBeenCalled()
    store.selectedFrame = 'frame'
    store.panBy({ x: 50, y: 20 })
    store.setTool('select')
    expect(JSON.parse(setItem.mock.calls.at(-1)![1])).toEqual({ zoom: 4, tool: 'select', frameBackground: 'white' })
    expect(createCanvasStore().selectedFrame).toBe(null)
  })

  it.each(['select', 'pan', 'measure'] as const)('persists exclusive %s tool without a separate measurement preference', (tool) => {
    let saved: string | null = null
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => saved = value }
    const canvas = createCanvasStore({ storage })
    canvas.setTool(tool)
    expect(createCanvasStore({ storage }).tool).toBe(tool)
    expect(JSON.parse(saved!)).toEqual({ zoom: 'fit', tool, frameBackground: 'transparent' })
  })

  it.each([
    { saved: { tool: 'select', measure: true }, tool: 'measure' },
    { saved: { tool: 'pan', measure: false }, tool: 'pan' },
    { saved: { tool: 'unknown', measure: 'true' }, tool: 'select' },
    { saved: null, tool: 'select' },
  ])('normalizes saved preferences $saved', ({ saved, tool }) => {
    expect(createCanvasStore({ storage: { getItem: () => JSON.stringify(saved), setItem: vi.fn() } }).tool).toBe(tool)
  })

  it('keeps current tool usable when preference reads and writes throw', () => {
    const denied = () => {
      throw new Error('Storage denied')
    }
    const canvas = createCanvasStore({ storage: { getItem: denied, setItem: denied } })
    expect(canvas.tool).toBe('select')
    expect(() => canvas.setTool('measure')).not.toThrow()
    expect(canvas.tool).toBe('measure')
  })
})
