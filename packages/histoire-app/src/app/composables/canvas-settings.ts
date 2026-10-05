import type { HistoireSession } from '@histoire/sdk'
import type { InjectionKey } from 'vue'
import type { CanvasFrameState } from '../components/canvas/frame-state.js'
import type { CanvasPoint, CanvasRect } from '../components/canvas/pan/usePanZoom.js'
import type { usePointerPan } from '../components/canvas/pan/usePointerPan.js'
import type { CanvasStore } from '../stores/canvas.js'
import { inject, provide, shallowReactive } from 'vue'

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
  /** Actual preview document, absent for budget placeholders. */
  iframe?: HTMLIFrameElement | null
  /** Parent-minted document identity read from active sandbox URL. */
  documentId?: string | null
  /** Owning isolated session; selected frame points to canonical provider. */
  session?: HistoireSession
  /** Complete displayed matrix props; capture snapshots these without canonical mutation. */
  propsOverride?: Record<string, unknown>
}

/** Registry is independent per mounted canvas, including multiple native hosts. */
export function createCanvasFrames(store: CanvasStore) {
  const frames = shallowReactive(new Map<string, CanvasFrameRegistration>())
  return { frames,
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
    /** Finite additive preview requests stay pinned to current same-origin document. */
    postToFrame(id: string, payload: Record<string, unknown>): boolean {
      const frame = frames.get(id)
      if (!frame?.iframe?.contentWindow || !frame.documentId) return false
      const window = frame.iframe.ownerDocument.defaultView
      if (!window) return false
      frame.iframe.contentWindow.postMessage({ ...payload, __histoire: true, documentId: frame.documentId }, window.location.origin)
      return true
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
