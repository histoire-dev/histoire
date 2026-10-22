import type { CanvasArrangement, CanvasStore } from '../../stores/canvas.js'
import type { SingleVariantPan } from './useSingleVariantPan.js'
import { computed, onBeforeUnmount, watch } from 'vue'
import { getActiveCanvasTool } from './active-tool.js'
import { usePointerPan } from './pan/usePointerPan.js'
import { useSpacePan } from './pan/useSpacePan.js'

/** One viewport owns gestures across free canvas and bounded single-mode scrolling. */
interface CanvasPanOptions {
  /** Existing persistent camera and tool owner. */
  canvas: CanvasStore
  /** Keyboard ownership and pointer-capture root. */
  viewport: () => HTMLElement | undefined
  /** Actual displayed arrangement, including matrix fallback. */
  arrangement: () => CanvasArrangement
  /** Replacement target retires any captured gesture. */
  frameId: () => string | undefined
  /** Mounted single-mode scroll adapter, absent outside that presentation. */
  single: () => SingleVariantPan | undefined
}

/** Route shared gestures through the active presentation's position owner. */
export function useCanvasPan(options: CanvasPanOptions) {
  const single = () => options.arrangement() === 'single'
  const enabled = () => !single() || !!options.single()?.canPan
  const space = useSpacePan({ enabled, getTool: () => getActiveCanvasTool(options.canvas), getRoot: options.viewport })
  const pointer = usePointerPan({
    enabled,
    getTool: () => getActiveCanvasTool(options.canvas),
    getSpace: () => space.held.value,
    getOffset: () => single() ? options.single()?.getOffset() ?? { x: 0, y: 0 } : options.canvas.panOffset,
    setOffset: offset => single() ? options.single()?.setOffset(offset) : options.canvas.setPanOffset(offset),
    onActive: active => options.canvas.panning = active,
  })
  const panning = computed(() => enabled() && (getActiveCanvasTool(options.canvas) === 'pan' || space.held.value || options.canvas.panning))

  /** Old pointer deltas must never cross a target, arrangement, or eligibility boundary. */
  function release(): void {
    pointer.release()
    space.release()
  }

  watch([options.arrangement, options.frameId, enabled], release, { flush: 'sync' })
  onBeforeUnmount(release)
  return { space, pointer, panning }
}
