import type { HistoireSession } from '@histoire/sdk'
import type { InjectionKey } from 'vue'
import type { CanvasFrameState } from '../components/canvas/frame-state.js'
import type { CanvasPoint, CanvasRect } from '../components/canvas/pan/usePanZoom.js'
import type { usePointerPan } from '../components/canvas/pan/usePointerPan.js'
import type { CanvasStore } from '../stores/canvas.js'
import { STORY_REMOUNT } from '@histoire/shared'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed, inject, provide, shallowReactive } from 'vue'

/** Current mounted frame geometry and isolated document identity. */
export interface CanvasFrameRegistration {
  /** Canvas frame key scoped to story. */
  id: string
  /** Collected story identifier. */
  storyId: string
  /** Collected variant identifier. */
  variantId: string
  /** Preview body bounds in unscaled canvas CSS pixels. */
  rect: CanvasRect
  /** Complete label/preview bounds recomputed for selection's target zoom. */
  fitBounds?: (zoom: number) => CanvasRect
  /** Actual preview document, absent for budget placeholders. */
  iframe?: HTMLIFrameElement | null
  /** Parent-minted document identity read from active sandbox URL. */
  documentId?: string | null
  /** Exact mounted frame owner; selection does not transfer runtime ownership. */
  session?: HistoireSession
  /** Complete displayed matrix props; capture snapshots these without canonical mutation. */
  propsOverride?: Record<string, unknown>
  /** Remount requests delivered to this frame, so chrome can acknowledge each one. */
  remounts?: number
}

/** Registry is independent per mounted canvas, including multiple native hosts. */
export function createCanvasFrames(store: CanvasStore) {
  const frames = shallowReactive(new Map<string, CanvasFrameRegistration>())
  /** Finite additive preview requests stay pinned to current same-origin document. */
  function postToFrame(id: string, payload: Record<string, unknown>): boolean {
    const frame = frames.get(id)
    if (!frame?.iframe?.contentWindow || !frame.documentId) return false
    const window = frame.iframe.ownerDocument.defaultView
    if (!window) return false
    frame.iframe.contentWindow.postMessage({ ...payload, __histoire: true, documentId: frame.documentId }, window.location.origin)
    return true
  }
  /** Replay the rendered variant's mount lifecycle without reloading its document. */
  function remountFrame(id: string): boolean {
    const frame = frames.get(id)
    if (!frame || !postToFrame(id, { type: STORY_REMOUNT, storyId: frame.storyId, variantId: frame.variantId })) return false
    frame.remounts = (frame.remounts ?? 0) + 1
    return true
  }
  return { frames, postToFrame, remountFrame,
    /** Replacement cleanup cannot remove its successor registration. */
    registerFrame(frame: CanvasFrameRegistration) {
      const record = shallowReactive(frame)
      frames.set(frame.id, record)
      return () => {
        if (frames.get(frame.id) === record) frames.delete(frame.id)
      }
    },
    /** Read current frame including budget placeholders. */
    getFrame(id: string) { return frames.get(id) ?? null },
    /** Convert browser pointer to preview document CSS pixels using actual frame bounds. */
    clientToFrame(id: string, point: CanvasPoint): CanvasPoint | null {
      const frame = frames.get(id)
      const rect = frame?.iframe?.getBoundingClientRect()
      if (!frame || !rect?.width || !rect.height) return null
      return { x: (point.x - rect.left) * frame.rect.width / rect.width, y: (point.y - rect.top) * frame.rect.height / rect.height }
    },
    /** Convert preview CSS pixels to browser coordinates for overlays. */
    frameToClient(id: string, point: CanvasPoint): CanvasPoint | null {
      const frame = frames.get(id)
      const rect = frame?.iframe?.getBoundingClientRect()
      if (!frame || !rect) return null
      return { x: rect.left + point.x * rect.width / frame.rect.width, y: rect.top + point.y * rect.height / frame.rect.height }
    },
    /** Remount every running frame in the same task so their animations start together. */
    remountAll(): number {
      return [...frames.keys()].filter(remountFrame).length
    },
    /** Canvas scale exposed for overlay helpers without leaking root DOM. */
    get zoom() { return store.effectiveZoom } }
}

/** Current canvas registry type. */
export type CanvasFrames = ReturnType<typeof createCanvasFrames>
/** Shared viewport pan owner accepted by overlays that cover preview content. */
export type CanvasPointerPan = Pick<ReturnType<typeof usePointerPan>, 'isPanning' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'release'>
const canvasKey: InjectionKey<CanvasStore> = Symbol('histoire-canvas')
const framesKey: InjectionKey<CanvasFrames> = Symbol('histoire-canvas-frames')
const frameStateKey: InjectionKey<CanvasFrameState> = Symbol('histoire-canvas-frame-state')
const pointerPanKey: InjectionKey<CanvasPointerPan> = Symbol('histoire-canvas-pointer-pan')

/** Provide one canvas backing to toolbar, frame chrome and overlays. */
export function provideCanvas(store: CanvasStore, frames = createCanvasFrames(store), frameState?: CanvasFrameState) {
  provide(canvasKey, store)
  provide(framesKey, frames)
  if (frameState) provide(frameStateKey, frameState)
  return frames
}

/** Consume nearest canvas instance; no app-global singleton or Pinia requirement. */
export function useCanvasStore(): CanvasStore {
  const store = inject(canvasKey)
  if (!store) throw new Error('Canvas requires provideCanvas().')
  return store
}

/** Narrow name used by native and standalone tools. */
export const useCanvasSettings = useCanvasStore

/** Resolve complete frame override or canonical background without duplicating persistence. */
export function useCanvasFrameBackground(frameId: () => string) {
  const canvas = useCanvasStore()
  const snapshot = useHistoireSnapshot()
  return computed(() => canvas.frameBackgrounds[frameId()] ?? snapshot.value.settings)
}

/** Read nearest canvas frame registry for measuring, comments and screenshots. */
export function useCanvasFrames(): CanvasFrames {
  const registry = inject(framesKey)
  if (!registry) throw new Error('Canvas frames require provideCanvas().')
  return registry
}

/** Provide viewport-owned pointer gestures to transparent interactive overlays. */
export function provideCanvasPointerPan(pointer: CanvasPointerPan): void {
  provide(pointerPanKey, pointer)
}

/** Optional relay keeps portable canvas consumers independent of viewport input. */
export function useCanvasPointerPan(): CanvasPointerPan | undefined {
  return inject(pointerPanKey, undefined)
}

/** Optional canonical projection cache; passive previews never publish back into it. */
export function useCanvasFrameState(): CanvasFrameState | undefined {
  return inject(frameStateKey, undefined)
}
