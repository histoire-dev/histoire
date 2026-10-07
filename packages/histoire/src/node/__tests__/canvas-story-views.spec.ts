import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { layoutCanvasFrames } from '../../../../histoire-app/src/app/components/canvas/frame-layout.js'
import { bindStoryCanvasView } from '../../../../histoire-app/src/app/components/canvas/story-view-binding.js'
import { createWorkbenchArrangement } from '../../../../histoire-app/src/app/standalone/arrangement.js'
import { type CanvasArrangement, type CanvasViewSnapshot, createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { createStoryCanvasViews } from '../../../../histoire-app/src/app/stores/story-canvas-views.js'

/** Make one canvas binding with reactive story and arrangement inputs. */
function createBinding(initialStory = 'first', initialView: { baseArrangement?: CanvasArrangement, arrangementOverride?: boolean } = {}, views = createStoryCanvasViews()) {
  const storyId = ref<string | undefined>(initialStory)
  const baseArrangement = ref<CanvasArrangement>(initialView.baseArrangement ?? 'grid')
  const routeArrangement = ref<unknown>(initialView.arrangementOverride ? 'grid' : undefined)
  const syncZoom = ref(false)
  const arrangementState = createWorkbenchArrangement({
    query: () => routeArrangement.value,
    storyId: () => storyId.value,
    storyLayout: () => baseArrangement.value,
    layoutExplicit: () => true,
    localDefault: () => undefined,
    projectDefault: () => undefined,
    syncZoom: () => syncZoom.value,
    views,
  })
  const canvas = createCanvasStore()
  canvas.setGeometry({ width: 720, height: 520 }, { x: 0, y: 0, width: 400, height: 260 })
  const binding = bindStoryCanvasView({
    getStoryId: () => storyId.value,
    getArrangement: () => arrangementState.arrangement.value,
    getRenderedArrangement: () => arrangementState.arrangement.value,
    getBaseArrangement: () => baseArrangement.value,
    hasArrangementOverride: () => arrangementState.override.value,
    getSyncZoom: () => syncZoom.value,
    canvas,
    views,
  })
  return { storyId, routeArrangement, arrangement: arrangementState.arrangement, baseArrangement, syncZoom, canvas, views, binding }
}

/** Create a plain view value for arrangement-precedence tests. */
function view(arrangement: CanvasArrangement): CanvasViewSnapshot {
  return { arrangement, zoomByArrange: { single: 1, grid: 1, list: 0.5, matrix: 'fit' }, panOffset: { x: 18, y: -24 } }
}

describe('story canvas views', () => {
  it.each([false, true])('fits Matrix on saved story entry, navigation, and remount with sync=%s', async (sync) => {
    const views = createStoryCanvasViews()
    const saved = view('matrix')
    saved.zoomByArrange.matrix = 1.77
    views.saveStory('first', saved)
    views.saveStory('second', saved)
    const state = createBinding('first', {}, views)
    try {
      expect(state.canvas.zoom).toBe('fit')
      expect(saved.zoomByArrange.matrix).toBe(1.77)
      expect(state.canvas.zoomByArrange.grid).toBe(1)
      expect(state.canvas.zoomByArrange.list).toBe(0.5)
      state.canvas.setZoom(2)
      state.syncZoom.value = sync
      expect(state.canvas.zoom).toBe(2)
      state.storyId.value = 'second'
      await nextTick()
      expect(state.canvas.zoom).toBe('fit')
      expect(views.getStory('first')?.zoomByArrange.matrix).toBe(2)
      state.canvas.setZoom(0.25)
      state.storyId.value = 'first'
      await nextTick()
      expect(state.canvas.zoom).toBe('fit')
      state.canvas.setZoom(1.77)
    }
    finally { state.binding.dispose() }
    const restored = createBinding('first', {}, views)
    try {
      expect(restored.canvas.arrangement).toBe('matrix')
      expect(restored.canvas.zoom).toBe('fit')
      expect(restored.canvas.zoomByArrange.list).toBe(0.5)
    }
    finally { restored.binding.dispose() }
  })

  it('restores detached Matrix snapshots without fitting outgoing story bounds', () => {
    const canvas = createCanvasStore()
    canvas.setZoom(0.5)
    canvas.setGeometry({ width: 1000, height: 800 }, { x: 0, y: 0, width: 100, height: 100 })
    const saved = view('matrix')
    saved.zoomByArrange.matrix = 1.77
    canvas.restoreView(saved)
    expect(canvas.zoom).toBe('fit')
    expect(canvas.effectiveZoom).toBe(0.5)
    expect(canvas.panOffset).toEqual(saved.panOffset)
    expect(saved.zoomByArrange.matrix).toBe(1.77)
    canvas.setGeometry({ width: 1000, height: 800 }, { x: 0, y: 0, width: 2000, height: 1000 })
    expect(canvas.effectiveZoom).toBeCloseTo(0.468)
  })

  it('restores Single zoom per story and shares it only while synchronization is enabled', async () => {
    const state = createBinding('first', { baseArrangement: 'single' })
    state.canvas.setArrangement('single')
    state.canvas.setZoom(0.5)
    state.storyId.value = 'second'
    await nextTick()
    expect(state.canvas.zoom).toBe('fit')
    state.canvas.setZoom(0.75)
    state.storyId.value = 'first'
    await nextTick()
    expect(state.canvas.zoom).toBe(0.5)
    state.syncZoom.value = true
    state.storyId.value = 'second'
    await nextTick()
    expect(state.canvas.zoom).toBe(0.5)
    state.canvas.setZoom(2)
    expect(state.views.getShared()?.zoomByArrange.single).toBe(2)
    state.syncZoom.value = false
    expect(state.canvas.zoom).toBe(0.75)
    state.binding.dispose()
  })

  it('preserves List selection mode across story restore, remount, and shared views', async () => {
    const state = createBinding('first', { baseArrangement: 'list' })
    state.canvas.setArrangement('list')
    state.canvas.resetZoom()
    state.storyId.value = 'second'
    await nextTick()
    expect(state.canvas.zoom).toBe('selection')
    state.canvas.setZoom(0.5)
    state.storyId.value = 'first'
    await nextTick()
    expect(state.canvas.zoom).toBe('selection')
    state.syncZoom.value = true
    state.storyId.value = 'second'
    await nextTick()
    expect(state.canvas.zoom).toBe('selection')
    state.syncZoom.value = false
    expect(state.canvas.zoom).toBe(0.5)
    state.storyId.value = 'first'
    await nextTick()
    state.binding.dispose()

    const restored = createBinding('first', {}, state.views)
    expect(restored.canvas.arrangement).toBe('list')
    expect(restored.canvas.zoom).toBe('selection')
    expect(typeof restored.canvas.effectiveZoom).toBe('number')
    restored.binding.dispose()
  })

  it('restores independent zoom and camera position when returning to a story', async () => {
    const state = createBinding()
    state.canvas.setZoom(2)
    state.canvas.setPanOffset({ x: 145, y: -60 })
    state.storyId.value = 'second'
    await nextTick()
    state.canvas.setZoom(0.5)
    state.canvas.setPanOffset({ x: 10, y: 72 })

    state.storyId.value = 'first'
    await nextTick()

    expect(state.canvas.zoom).toBe(2)
    expect(state.canvas.panOffset).toEqual({ x: 145, y: -60 })
    expect(state.views.getStory('second')?.panOffset).toEqual({ x: 10, y: 72 })
    state.binding.dispose()
  })

  it('restores each story arrangement with its zoom and camera position', async () => {
    const views = createStoryCanvasViews()
    const firstView = view('list')
    firstView.zoomByArrange.list = 0.75
    firstView.panOffset = { x: 112, y: -42 }
    const secondView = view('grid')
    secondView.zoomByArrange.grid = 1.5
    secondView.panOffset = { x: -28, y: 96 }
    views.saveStory('first', firstView)
    views.saveStory('second', secondView)
    const state = createBinding('first', {}, views)

    expect(state.canvas.arrangement).toBe('list')
    expect(state.canvas.zoom).toBe(0.75)
    state.storyId.value = 'second'
    await nextTick()
    expect(state.canvas.arrangement).toBe('grid')
    expect(state.canvas.zoom).toBe(1.5)
    expect(state.canvas.panOffset).toEqual({ x: -28, y: 96 })
    state.storyId.value = 'first'
    await nextTick()

    expect(state.canvas.arrangement).toBe('list')
    expect(state.canvas.zoom).toBe(0.75)
    expect(state.canvas.panOffset).toEqual({ x: 112, y: -42 })
    state.binding.dispose()
  })

  it('shares one view while sync is enabled and restores story views when disabled', async () => {
    const state = createBinding()
    state.canvas.setZoom(2)
    state.canvas.setPanOffset({ x: 120, y: 35 })
    state.syncZoom.value = true
    state.storyId.value = 'second'
    await nextTick()
    expect(state.canvas.zoom).toBe(2)
    expect(state.canvas.panOffset).toEqual({ x: 120, y: 35 })

    state.canvas.setZoom(1.5)
    state.canvas.setPanOffset({ x: 70, y: -12 })
    state.storyId.value = 'first'
    await nextTick()
    expect(state.canvas.zoom).toBe(1.5)
    expect(state.canvas.panOffset).toEqual({ x: 70, y: -12 })

    state.syncZoom.value = false
    expect(state.canvas.zoom).toBe(2)
    expect(state.canvas.panOffset).toEqual({ x: 120, y: 35 })
    state.binding.dispose()
  })

  it('keeps saved arrangement when an explicit route arrangement is active', () => {
    const state = createBinding('first', { baseArrangement: 'list', arrangementOverride: true })
    state.canvas.setArrangement('grid')
    expect(state.views.getStory('first')?.arrangement).toBe('list')
    state.routeArrangement.value = undefined
    expect(state.views.getStory('first')?.arrangement).toBe('list')
    state.binding.dispose()
  })

  it('resolves explicit URL arrangement before story memory and defaults', () => {
    const views = createStoryCanvasViews()
    views.saveStory('first', view('matrix'))
    views.saveShared(view('grid'))
    const query = ref<unknown>(undefined)
    const storyId = ref<string | undefined>('first')
    const syncZoom = ref(false)
    const arrangementState = createWorkbenchArrangement({
      query: () => query.value,
      storyId: () => storyId.value,
      storyLayout: () => 'list',
      localDefault: () => 'grid',
      projectDefault: () => undefined,
      syncZoom: () => syncZoom.value,
      views,
    })

    expect(arrangementState.arrangement.value).toBe('matrix')
    query.value = 'list'
    expect(arrangementState.arrangement.value).toBe('list')
    query.value = undefined
    syncZoom.value = true
    expect(arrangementState.arrangement.value).toBe('grid')
    query.value = 'matrix'
    expect(arrangementState.arrangement.value).toBe('matrix')
  })

  it('returns detached snapshots so one story cannot mutate another view', () => {
    const views = createStoryCanvasViews()
    const saved = view('list')
    views.saveStory('first', saved)
    saved.panOffset.x = 900
    const loaded = views.getStory('first')!
    loaded.zoomByArrange.list = 3

    expect(views.getStory('first')).toEqual(view('list'))
    expect(views.getStory('second')).toBeUndefined()
  })

  it('retains a story view across canvas viewport remounts in one workbench', () => {
    const first = createBinding()
    first.canvas.setZoom(1.25)
    first.canvas.setPanOffset({ x: 88, y: -31 })
    first.binding.dispose()

    const remounted = createBinding('first', {}, first.views)

    expect(remounted.canvas.zoom).toBe(1.25)
    expect(remounted.canvas.panOffset).toEqual({ x: 88, y: -31 })
    remounted.binding.dispose()
  })

  it('does not move the camera when initial focus follows a restored view', () => {
    const state = createBinding()
    state.canvas.setZoom(2)
    state.canvas.setPanOffset({ x: 500, y: 250 })
    state.binding.dispose()
    const restored = createBinding('first', {}, state.views)
    const frame = layoutCanvasFrames('first', ['main'], { width: 300, height: 200 }, 'grid')[0]

    restored.binding.focusInitialFrame(frame)

    expect(restored.canvas.panOffset).toEqual({ x: 500, y: 250 })
    expect(restored.canvas.selectedFrame).toBe(frame.id)
    expect(restored.binding.shouldRevealFrame(frame)).toBe(false)
    restored.binding.dispose()
  })
})
