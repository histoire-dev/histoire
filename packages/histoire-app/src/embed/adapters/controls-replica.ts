import type { HistoireBridgePublication, HistoireControlsOverlayMessage } from '@histoire/protocol'
import type { EmbedSurfaceContext } from '../surfaces.js'
import { getControlsAppearance } from '@histoire/controls/vue'
import { CONTROLS_APPEARANCE, CONTROLS_FOCUS, CONTROLS_OVERLAY, CONTROLS_OVERLAY_REFRESH, CONTROLS_OVERLAY_RESULT, CONTROLS_READY, CONTROLS_RESIZE, createControlsStateRevision, HistoireSdkError, mapRuntimeViewport, PREVIEW_SETTINGS_SYNC, RUNTIME_FAILED, STATE_SYNC, validateBridgeEventPayload, validateHistoireStateSnapshot } from '@histoire/protocol'
import { createRuntimeDocumentOwner } from './document.js'
/** Same-origin custom controls replica; all edits resolve through canonical parent runtime. */
export function createEmbedControlsReplica(context: EmbedSurfaceContext, changed: (hasControls: boolean, height: number) => void) {
  const window = context.container.ownerDocument.defaultView!
  const owner = createRuntimeDocumentOwner()
  const iframe = context.container.ownerDocument.createElement('iframe')
  iframe.title = 'Histoire custom controls'
  iframe.style.cssText = 'border:0;display:block;width:100%;height:32px;'
  let active = true
  let ready = false
  let hasControls = false
  let height = 32
  let documentCounter = 0
  let appearanceRevision = 0
  let canonicalId: string | null = null
  let pendingEdits = 0
  let controlsRevision = createControlsStateRevision()
  let currentOverlay: HistoireControlsOverlayMessage | null = null
  const retiredOverlays = new Set<string>()
  let deadline: ReturnType<typeof setTimeout> | undefined
  let resolveReady: () => void
  let rejectReady: (error: unknown) => void
  const readiness = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  void readiness.catch(() => {
  })
  /** Primary selection/document must still match after every asynchronous edit. */
  function current(): boolean {
    if (!active) {
      return false
    }
    const snapshot = context.session.getSnapshot()
    return snapshot.runtime.status === 'ready' && snapshot.runtime.runtimeId === canonicalId
      && snapshot.selection?.storyId === owner.target?.storyId && snapshot.selection?.variantId === owner.target?.variantId
  }
  /** Source wrapper remains only same-origin authority for this replica document. */
  function post(payload: Record<string, unknown>): void {
    if (active && owner.id) {
      iframe.contentWindow?.postMessage({ __histoire: true, ...owner.target, ...payload, documentId: owner.id }, window.location.origin)
    }
  }
  /** Outer traffic binds canonical primary runtime plus controls mount; replica never claims state. */
  function publish(event: HistoireBridgePublication['event'], payload: unknown): void {
    if (current()) {
      context.bridge.post(event, payload, { runtimeId: canonicalId!, target: owner.target! })
    }
  }
  /** Same portable geometry composes sandbox-to-wrapper before SDK adds outer frame scale. */
  function refreshOverlay(event: 'overlay.open' | 'overlay.update' = 'overlay.update'): void {
    const value = currentOverlay
    if (!value?.overlay || !current()) {
      return
    }
    const anchor = mapRuntimeViewport({ ...value.anchor, target: owner.target!, visibleRect: value.anchor, scale: 1 }, iframe.getBoundingClientRect(), { width: iframe.clientWidth || 1, height: iframe.clientHeight || 1 }, { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })
    publish(anchor ? event : 'overlay.close', anchor ? { id: value.id, anchor: anchor.visibleRect, overlay: value.overlay } : { id: value.id })
  }
  /** Bounded resolved identities cannot be reopened by delayed same-document updates. */
  function retireOverlay(id: string): void {
    retiredOverlays.add(id)
    if (retiredOverlays.size > 1000) retiredOverlays.delete(retiredOverlays.values().next().value!)
  }
  /** Ask child to remeasure only on host movement, avoiding publication echo loop. */
  function requestOverlayRefresh(): void {
    refreshOverlay()
    if (currentOverlay) {
      post({ type: CONTROLS_OVERLAY_REFRESH, id: currentOverlay.id })
    }
  }
  /** Read owning panel after its queued Vue render, never from previous theme's DOM. */
  function synchronizeAppearance(dark: boolean): void {
    const documentId = owner.id
    const revision = ++appearanceRevision
    queueMicrotask(() => {
      // Rapid settings changes/navigation retire scheduled reads with their document.
      if (!current() || owner.id !== documentId || appearanceRevision !== revision) return
      post({ type: CONTROLS_APPEARANCE, appearance: getControlsAppearance(context.container, dark, context.descriptor.config?.theme.colors) })
    })
  }
  /** Source-local panel styling and host-owned runtime settings reach replica explicitly. */
  function synchronize(): void {
    if (!active) {
      return
    }
    const snapshot = context.session.getSnapshot()
    if (snapshot.runtime.status !== 'ready' || !snapshot.selection?.variantId) {
      owner.close()
      canonicalId = null
      ready = false
      pendingEdits = 0
      controlsRevision = createControlsStateRevision()
      currentOverlay = null
      retiredOverlays.clear()
      iframe.remove()
      changed(false, 0)
      resolveReady()
      return
    }
    if (canonicalId !== snapshot.runtime.runtimeId || owner.target?.storyId !== snapshot.selection.storyId || owner.target.variantId !== snapshot.selection.variantId) {
      currentOverlay = null
      retiredOverlays.clear()
      ready = false
      pendingEdits = 0
      controlsRevision = createControlsStateRevision()
      hasControls = false
      height = 32
      canonicalId = snapshot.runtime.runtimeId
      const documentId = `${context.bridge.getOwner().mountId}:controls:${++documentCounter}`
      owner.replace(documentId, snapshot.selection)
      const url = new URL('__sandbox.html', context.sourceBase ?? window.location.href)
      url.searchParams.set('storyId', snapshot.selection.storyId)
      url.searchParams.set('variantId', snapshot.selection.variantId)
      url.searchParams.set('controls', 'true')
      url.searchParams.set('documentId', documentId)
      iframe.src = url.href
      context.container.append(iframe)
      context.bridge.post('readiness.changed', { runtime: { ...snapshot.runtime, mountId: context.bridge.getOwner().mountId } }, { runtimeId: canonicalId!, target: owner.target! })
      clearTimeout(deadline)
      deadline = setTimeout(() => {
        if (current() && !ready) {
          rejectReady(new HistoireSdkError('TIMEOUT', 'Controls replica readiness timed out'))
        }
      }, context.descriptor.config?.storyCollectTimeout ?? 30000)
    }
    post({ type: PREVIEW_SETTINGS_SYNC, settings: snapshot.settings })
    const dark = snapshot.settings.colorScheme === 'dark' || (snapshot.settings.colorScheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    synchronizeAppearance(dark)
    // Canonical acknowledgments may trail later keystrokes. Keep replica's
    // live edit projection until all edits for this document have settled.
    if (ready && pendingEdits === 0 && snapshot.state?.runtimeId === canonicalId) {
      post({ type: STATE_SYNC, state: snapshot.state.value, controlsRevision: controlsRevision.current })
    }
  }
  /** Marker, exact frame, origin and document identity checked before any payload. */
  function receive(event: MessageEvent): void {
    const value = event.data
    if (!current() || event.source !== iframe.contentWindow || event.origin !== window.location.origin || !value?.__histoire || value.documentId !== owner.id) {
      return
    }
    // Boot failure may precede story hydration, so target fields are absent.
    // Exact document/source ownership still makes this failure attributable.
    if (value.type === RUNTIME_FAILED) {
      rejectReady(new HistoireSdkError('PREVIEW_NOT_READY', value.error?.message ?? 'Controls replica failed'))
      return
    }
    if (!owner.accepts(value)) {
      return
    }
    if (value.type === CONTROLS_READY) {
      ready = true
      hasControls = value.hasControls === true
      clearTimeout(deadline)
      changed(hasControls, hasControls ? height : 0)
      publish('controls.height', { height: hasControls ? height : 0, hasControls })
      synchronize()
      resolveReady()
    }
    else if (value.type === CONTROLS_RESIZE && Number.isFinite(value.height) && value.height >= 0) {
      height = Math.ceil(value.height)
      iframe.style.height = `${height}px`
      changed(hasControls, hasControls ? height : 0)
      publish('controls.height', { height: hasControls ? height : 0, hasControls })
      requestOverlayRefresh()
    }
    else if (value.type === STATE_SYNC && ready) {
      try {
        validateHistoireStateSnapshot({ target: owner.target!, runtimeId: canonicalId!, value: value.state })
        if (!controlsRevision.receive(value.controlsRevision)) return
        const { _hPropDefs: _definitions, ...patch } = value.state
        const captured = owner.id
        pendingEdits++
        void Promise.resolve().then(() => {
          if (!current() || owner.id !== captured) throw new HistoireSdkError('RUNTIME_CHANGED', 'Controls edit owner changed')
          return context.session.state.patch(patch)
        }).catch(() => {
          // Error remains owned by canonical operation; replica restores last
          // accepted state once current pending edits drain.
        }).finally(() => {
          if (current() && owner.id === captured) {
            pendingEdits--
            synchronize()
          }
        })
      }
      catch {
        // Malformed replica projection never edits canonical primary.
      }
    }
    else if (value.type === CONTROLS_OVERLAY) {
      try {
        validateBridgeEventPayload(value.overlay === null ? 'overlay.close' : 'overlay.open', value.overlay === null ? { id: value.id } : { id: value.id, anchor: value.anchor, overlay: value.overlay })
      }
      catch {
        return
      }
      if (retiredOverlays.has(value.id)) return
      if (!value.overlay) {
        retireOverlay(value.id)
        if (currentOverlay?.id === value.id) {
          currentOverlay = null
        }
        publish('overlay.close', { id: value.id })
        return
      }
      const opening = currentOverlay?.id !== value.id
      currentOverlay = value
      refreshOverlay(opening ? 'overlay.open' : 'overlay.update')
    }
    else if (value.type === CONTROLS_FOCUS && ['next', 'previous'].includes(value.direction)) {
      publish('focus.changed', { focused: false, direction: value.direction })
    }
  }
  let off = () => {
  }
  let resize: ResizeObserver | undefined
  /** Register reverse unwind before subscriptions or observers can throw during startup. */
  function close(): void {
    if (!active) {
      return
    }
    active = false
    owner.close()
    currentOverlay = null
    retiredOverlays.clear()
    clearTimeout(deadline)
    rejectReady(new HistoireSdkError('RUNTIME_CHANGED', 'Controls replica detached'))
    try {
      off()
    }
    finally {
      resize?.disconnect()
      window.removeEventListener('message', receive)
      window.removeEventListener('resize', requestOverlayRefresh)
      context.container.ownerDocument.removeEventListener('scroll', requestOverlayRefresh, true)
      iframe.removeEventListener('load', synchronize)
      iframe.remove()
    }
  }
  try {
    off = context.session.subscribe(synchronize)
    window.addEventListener('message', receive)
    window.addEventListener('resize', requestOverlayRefresh)
    context.container.ownerDocument.addEventListener('scroll', requestOverlayRefresh, true)
    iframe.addEventListener('load', synchronize)
    resize = new ResizeObserver(requestOverlayRefresh)
    resize.observe(context.container)
    synchronize()
  }
  catch (error) {
    close()
    throw error
  }
  return {
    ready: readiness,
    /** Resolve only current opaque ID and current replica; callback remains inside sandbox. */
    publication(event: HistoireBridgePublication): void {
      const value = event.payload as any
      if (!current() || event.event !== 'overlay.result' || event.runtimeId !== canonicalId || event.target?.storyId !== owner.target?.storyId || event.target?.variantId !== owner.target?.variantId || currentOverlay?.id !== value.id) {
        return
      }
      retireOverlay(value.id)
      currentOverlay = null
      post({ type: CONTROLS_OVERLAY_RESULT, ...value })
    },
    /** Retire maps and listeners before detached frame can post late focus/state/height. */
    close,
  }
}
