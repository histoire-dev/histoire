import type { HistoireSession } from '@histoire/sdk'
import type { CanvasFrameRegistration } from '../../composables/canvas-settings.js'
import type { MeasureOwner } from './measure-controller.js'

/** Measurement reads actual owning session, including passive matrix previews. */
type MeasureSnapshot = ReturnType<HistoireSession['getSnapshot']>

/** Physical frame eligibility shared by tool controls and shortcuts; runtime readiness stays owner-bound. */
export function canMeasureFrame(frame: CanvasFrameRegistration | null): frame is CanvasFrameRegistration & { iframe: HTMLIFrameElement, documentId: string } {
  const iframe = frame?.iframe
  const host = iframe?.ownerDocument.defaultView
  if (!frame?.documentId || !iframe?.contentWindow || !host) return false
  try {
    return new URL(iframe.src, host.location.href).origin === host.location.origin
  }
  catch { return false }
}

/** Retire locks on source publication, selection, document, or readiness changes. */
export function getMeasureOwner(frame: CanvasFrameRegistration | null, snapshot: MeasureSnapshot | undefined, enabled: boolean): MeasureOwner | null {
  if (!enabled || !canMeasureFrame(frame) || !snapshot?.source
    || snapshot.status !== 'ready' || snapshot.stale || snapshot.runtime.status !== 'ready'
    || snapshot.runtime.runtimeId !== frame.documentId || snapshot.selection?.storyId !== frame.storyId
    || snapshot.selection.variantId !== frame.variantId) {
    return null
  }
  const iframe = frame.iframe
  const host = iframe.ownerDocument.defaultView!
  const source = snapshot.source
  return { frameId: frame.id, storyId: frame.storyId, variantId: frame.variantId, documentId: frame.documentId, source: iframe.contentWindow!, origin: host.location.origin, generation: JSON.stringify([source.url, source.sourceId, source.epoch, source.revision, snapshot.runtime.mountId]) }
}
