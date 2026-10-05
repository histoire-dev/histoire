import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { canvasToClient, clampZoom, clientToCanvas, fitCanvas, usePanZoom, zoomAroundPoint } from '../../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'
import { usePointerPan } from '../../../../histoire-app/src/app/components/canvas/pan/usePointerPan.js'
import { isTypingTarget, useSpacePan } from '../../../../histoire-app/src/app/components/canvas/pan/useSpacePan.js'

/** Creates pointer input without requiring a browser DOM. */
function pointer(pointerId: number, button: number, x: number, y: number): PointerEvent {
  return { pointerId, button, clientX: x, clientY: y, preventDefault: vi.fn(), currentTarget: null } as unknown as PointerEvent
}

/** Creates keyboard input without requiring a browser DOM. */
function key(target: EventTarget | null = null): KeyboardEvent {
  return { code: 'Space', key: ' ', target, preventDefault: vi.fn() } as unknown as KeyboardEvent
}

describe('canvas transforms', () => {
  it('keeps the canvas point under the cursor fixed while zooming', () => {
    const cursor = { x: 123, y: 87 }
    const offset = { x: -60, y: 24 }
    const canvasPoint = clientToCanvas(cursor, 0.75, offset)
    const next = zoomAroundPoint(0.75, 2, offset, cursor)
    expect(canvasToClient(canvasPoint, next.zoom, next.offset)).toEqual(cursor)
    expect(clampZoom(0)).toBe(0.1)
    expect(clampZoom(5)).toBe(4)
    expect(clampZoom(Number.NaN)).toBe(1)
  })

  it('fits bounds within the remaining viewport beside the inspector', () => {
    const bounds = { x: -200, y: 100, width: 800, height: 400 }
    const result = fitCanvas(bounds, { width: 1000, height: 600 }, { padding: 40, inspectorWidth: 300 })
    expect(result.zoom).toBe(620 / 800)
    const topLeft = canvasToClient(bounds, result.zoom, result.offset)
    const bottomRight = canvasToClient({ x: 600, y: 500 }, result.zoom, result.offset)
    expect(topLeft.x).toBe(40)
    expect(bottomRight.x).toBe(660)
    expect(topLeft.y).toBeGreaterThanOrEqual(40)
    expect(bottomRight.y).toBeLessThanOrEqual(560)
  })

  it('updates both zoom and offset through the composable state adapter', () => {
    let zoom = 1
    let offset = { x: 20, y: 10 }
    const panZoom = usePanZoom({ getZoom: () => zoom, setZoom: value => zoom = value, getOffset: () => offset, setOffset: value => offset = value })
    const point = panZoom.toCanvas({ x: 100, y: 100 })
    panZoom.zoomAt(2, { x: 100, y: 100 })
    expect(panZoom.toClient(point)).toEqual({ x: 100, y: 100 })
    panZoom.panBy({ x: 5, y: -5 })
    expect(offset).toEqual({ x: -55, y: -85 })
  })

  it('fits preview bounds below fixed controls and above bottom status', () => {
    const bounds = { x: 100, y: 50, width: 800, height: 400 }
    const result = fitCanvas(bounds, { width: 1000, height: 600 }, { padding: 20, inspectorWidth: 100, topInset: 160, bottomInset: 40 })
    const topLeft = canvasToClient(bounds, result.zoom, result.offset)
    const bottomRight = canvasToClient({ x: 900, y: 450 }, result.zoom, result.offset)
    expect(result.zoom).toBe(0.9)
    expect(topLeft.y).toBe(180)
    expect(bottomRight.y).toBe(540)
    expect(topLeft.x).toBeGreaterThanOrEqual(20)
    expect(bottomRight.x).toBeLessThanOrEqual(880)
  })
})

describe('canvas pointer pan', () => {
  it.each([
    { tool: 'select', space: true, button: 0 },
    { tool: 'select', space: false, button: 1 },
    { tool: 'pan', space: false, button: 0 },
  ])('uses the same delta for $tool tool, Space=$space, button=$button', ({ tool, space, button }) => {
    let offset = { x: 25, y: -12 }
    const pan = usePointerPan({ getTool: () => tool, getSpace: () => space, getOffset: () => offset, setOffset: value => offset = value })
    pan.onPointerDown(pointer(1, button, 10, 20))
    pan.onPointerMove(pointer(1, button, 50, 45))
    expect(offset).toEqual({ x: 65, y: 13 })
    expect(pan.isPanning.value).toBe(true)
    pan.onPointerUp(pointer(1, button, 50, 45))
    expect(pan.isPanning.value).toBe(false)
  })

  it('captures accepted gestures and releases capture on cancellation', () => {
    const target = { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn() }
    const onActive = vi.fn()
    const pan = usePointerPan({ getTool: () => 'pan', getSpace: () => false, getOffset: () => ({ x: 0, y: 0 }), setOffset: vi.fn(), onActive })
    const start = { ...pointer(7, 0, 0, 0), currentTarget: target } as unknown as PointerEvent
    pan.onPointerDown(start)
    expect(start.preventDefault).toHaveBeenCalled()
    expect(target.setPointerCapture).toHaveBeenCalledWith(7)
    pan.onPointerCancel(pointer(7, 0, 0, 0))
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(onActive.mock.calls).toEqual([[true], [false]])
  })

  it('preserves selection drags and ignores unrelated pointer movement', () => {
    const setOffset = vi.fn()
    const pan = usePointerPan({ getTool: () => 'select', getSpace: () => false, getOffset: () => ({ x: 0, y: 0 }), setOffset })
    pan.onPointerDown(pointer(1, 0, 10, 20))
    pan.onPointerMove(pointer(1, 0, 50, 45))
    expect(setOffset).not.toHaveBeenCalled()
    pan.onPointerDown(pointer(1, 1, 10, 20))
    pan.onPointerMove(pointer(2, 1, 50, 45))
    pan.onPointerUp(pointer(2, 1, 50, 45))
    expect(setOffset).not.toHaveBeenCalled()
    expect(pan.isPanning.value).toBe(true)
    pan.onPointerCancel(pointer(1, 1, 10, 20))
    expect(pan.isPanning.value).toBe(false)
  })
})

describe('temporary Space pan', () => {
  it('admits only owning canvas and releases temporary pan when focus leaves it', () => {
    const target = { tagName: 'DIV', closest: () => null } as unknown as HTMLElement
    const other = { tagName: 'DIV', closest: () => null } as unknown as HTMLElement
    const root = { contains: (value: unknown) => value === target } as unknown as HTMLElement
    const secondRoot = { contains: (value: unknown) => value === other } as unknown as HTMLElement
    const pan = useSpacePan({ getRoot: () => root })
    const second = useSpacePan({ getRoot: () => secondRoot })
    const event = key(target)
    pan.onKeyDown(event)
    second.onKeyDown(event)
    expect(pan.held.value).toBe(true)
    expect(second.held.value).toBe(false)
    pan.onFocusIn({ target: other } as unknown as FocusEvent)
    expect(pan.held.value).toBe(false)
    const outside = key(other)
    pan.onKeyDown(outside)
    expect(outside.preventDefault).not.toHaveBeenCalled()
  })

  it.each(['BUTTON', 'A', 'SUMMARY'])('preserves native Space activation on focused %s inside canvas', (tagName) => {
    const target = { tagName, closest: () => null } as unknown as HTMLElement
    const root = { contains: () => true } as unknown as HTMLElement
    const pan = useSpacePan({ getRoot: () => root })
    const event = key(target)
    pan.onKeyDown(event)
    expect(pan.held.value).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('admits owned iframe content but preserves its native button descendants', () => {
    const iframe = { closest: () => null } as unknown as HTMLIFrameElement
    const root = { contains: (value: unknown) => value === iframe } as unknown as HTMLElement
    const target = { tagName: 'DIV', closest: () => null, ownerDocument: { defaultView: { frameElement: iframe } } } as unknown as HTMLElement
    const pan = useSpacePan({ getRoot: () => root })
    pan.onKeyDown(key(target))
    expect(pan.held.value).toBe(true)
    const button = { ...target, closest: () => ({ tagName: 'BUTTON' }) } as unknown as HTMLElement
    pan.onFocusIn({ target: button } as unknown as FocusEvent)
    expect(pan.held.value).toBe(false)
    const event = key(button)
    pan.onKeyDown(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('restores the selected tool on keyup or lost focus without mutating it', () => {
    const tool = ref('select')
    const pan = useSpacePan({ getTool: () => tool.value })
    pan.onKeyDown(key())
    expect(pan.held.value).toBe(true)
    expect(pan.effectiveTool.value).toBe('pan')
    expect(tool.value).toBe('select')
    pan.onKeyUp(key())
    expect(pan.effectiveTool.value).toBe('select')
    tool.value = 'pan'
    pan.onKeyDown(key())
    pan.release()
    expect(pan.effectiveTool.value).toBe('pan')
  })

  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('ignores Space while typing in %s', (tagName) => {
    const target = { tagName } as unknown as EventTarget
    const pan = useSpacePan()
    pan.onKeyDown(key(target))
    expect(pan.held.value).toBe(false)
    expect(isTypingTarget(target)).toBe(true)
  })

  it('ignores inherited editable content', () => {
    const target = { tagName: 'SPAN', isContentEditable: true } as unknown as EventTarget
    const pan = useSpacePan()
    pan.onKeyDown(key(target))
    expect(pan.held.value).toBe(false)
  })
})
