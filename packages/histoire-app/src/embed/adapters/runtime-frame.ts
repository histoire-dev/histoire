import type { HistoireRuntimeSnapshot, HistoireStateSnapshot, HistoireTarget, HistoireViewport } from '@histoire/protocol'
import type { HistoireRequestCapture } from '@histoire/sdk/internal'
import type { EmbedSurfaceContext } from '../surfaces.js'
import { EVENT_SEND, HistoireSdkError, HOST_CHANNEL_MESSAGE, PREVIEW_SETTINGS_SYNC, PREVIEW_SYNC, RUNTIME_FAILED, RUNTIME_FOCUS, RUNTIME_LAYOUT, RUNTIME_REQUEST, RUNTIME_RESULT, SELECT_VARIANT, STATE_SYNC, TEST_DEFINITIONS, TEST_RESULT, validateHistoireStateSnapshot, validateHistoireViewports, validateWireValue, VARIANT_READY } from '@histoire/protocol'
import { createEmbedHostChannels } from './channels.js'
import { createRuntimeDocumentId, createRuntimeDocumentOwner } from './document.js'
import { mapRuntimeViewport } from './geometry.js'
import { createRuntimeLoadRecovery } from './runtime-loading.js'
import { createRuntimeReadiness } from './runtime-readiness.js'
import { createRuntimeRequests } from './runtime-requests.js'
import { createRuntimeRevisionOwner } from './runtime-revision.js'
import { createStalePreview } from './stale-preview.js'
import { createEmbedPreviewTests } from './tests.js'

/** Existing same-origin story sandbox, owned by one parent-backed primary surface. */
export function createEmbedRuntimeFrame(context: EmbedSurfaceContext, layout: 'single' | 'grid') {
  const owner = createRuntimeDocumentOwner()
  const iframe = context.container.ownerDocument.createElement('iframe')
  context.container.style.cssText = 'margin:0;width:100%;height:100%;overflow:auto;display:flex;align-items:flex-start;'
  iframe.title = 'Histoire preview'
  iframe.style.cssText = 'border:0;display:block;flex:none;max-width:100%;'
  const base = new URL(context.sourceBase ?? './', window.location.href)
  const stalePreview = createStalePreview(iframe, context.standalone)
  const sourceOwner = createRuntimeRevisionOwner()
  let active = true
  let retired = false
  let eventCounter = 0
  let selected: HistoireTarget | null = null
  const readyIds = new Set<string>()
  let states = new Map<string, Record<string, any>>()
  let viewports: HistoireViewport[] = []
  let sandboxViewports: HistoireViewport[] = []
  let scheduledLayout = 0
  const readiness = createRuntimeReadiness(context.descriptor.config.storyCollectTimeout ?? 30_000, fail)
  const requests = createRuntimeRequests(post, Math.max(context.descriptor.config.runTimeout ?? 300_000, context.descriptor.config.storyCollectTimeout ?? 30_000))
  const loading = createRuntimeLoadRecovery(settings, () => active && !retired && owner.id && selected && context.standalone && layout === 'single' ? owner.selectionVersion : null, () => {
    requests.invalidate()
    states.clear()
    owner.select(selected!, true)
    mounting(true)
    post({ type: PREVIEW_SYNC, ...selected!, grid: false, selectionVersion: owner.selectionVersion })
  })
  const channels = createEmbedHostChannels(context, () => ({ id: owner.id, selected, ready: id => readyIds.has(id) }))
  const tests = createEmbedPreviewTests(requests, (capture) => {
    if (!active || capture.runtimeId !== owner.id) return
    retired = true
    retireRuntime('stale', true, false)
    stalePreview.retireAfterCancellation(() => context.session.getSnapshot(), selected, () => active, (keepFrame) => {
      retired = !keepFrame
      if (!keepFrame) iframe.remove()
      publish('stale')
    })
  })

  /** Sandbox remains same-origin with wrapper; outer cross-origin bridge stays separate. */
  function post(message: Record<string, unknown>) {
    if (active && owner.id) iframe.contentWindow?.postMessage({ __histoire: true, ...message, documentId: owner.id }, window.location.origin)
  }
  /** Portable runtime status aliases currently selected visible content cell. */
  function snapshot(status: HistoireRuntimeSnapshot['status']): HistoireRuntimeSnapshot {
    return { status, mountId: context.bridge.getOwner().mountId, runtimeId: owner.id, layout, viewports, viewport: viewports.find(viewport => viewport.target.variantId === selected?.variantId) ?? null }
  }
  /** Runtime identity transitions reach parent before state/layout of replacement. */
  function publish(status: HistoireRuntimeSnapshot['status']) {
    const runtime = snapshot(status)
    context.bridge.post('readiness.changed', { runtime }, { runtimeId: owner.id ?? undefined, target: selected ?? undefined })
    return runtime
  }
  /** Each selected actor must acknowledge before requests resume. */
  function mounting(retainPending = false) {
    readyIds.clear()
    readiness.reset(retainPending)
    publish('mounting')
  }
  /** Only selected runtime state is host mirror; other grid states remain local. */
  function publishState() {
    const value = selected?.variantId ? states.get(selected.variantId) : undefined
    if (!value || !selected || !owner.id || !readyIds.has(selected.variantId!)) return
    const state: HistoireStateSnapshot = { target: selected, runtimeId: owner.id, value }
    context.bridge.post('state.changed', state, { runtimeId: owner.id, target: selected })
  }
  /** Wrapper scrolling/resize changes offsets even when child content stays fixed. */
  function refreshLayout() {
    if (!active || !owner.id || scheduledLayout) return
    scheduledLayout = requestAnimationFrame(() => {
      scheduledLayout = 0
      if (!active || !owner.id) return
      const rect = iframe.getBoundingClientRect()
      viewports = iframe.clientWidth && iframe.clientHeight ? sandboxViewports.filter(viewport => readyIds.has(viewport.target.variantId!)).map(viewport => mapRuntimeViewport(viewport, rect, { width: iframe.clientWidth, height: iframe.clientHeight }, { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })).filter(Boolean) : []
      context.bridge.post('layout.changed', { viewports }, { runtimeId: owner.id, target: selected! })
    })
  }
  /** Logical responsive dimensions belong to actual sandbox, including hidden preview. */
  function settings() {
    const value = context.session.getSnapshot().settings
    const width = value.rotate && value.responsiveHeight ? value.responsiveHeight : value.responsiveWidth
    const height = value.rotate ? value.responsiveWidth : value.responsiveHeight
    iframe.style.width = layout === 'grid' ? '100%' : `${width}px`
    iframe.style.height = height ? `${height}px` : '100%'
    iframe.style.minHeight = height ? '' : '240px'
    post({ type: PREVIEW_SETTINGS_SYNC, settings: value })
  }
  /** Revoke document, requests and channels before retaining pixels or removing DOM. */
  function retireRuntime(status: 'stale' | 'absent', keepFrame = false, publishNow = true) {
    requests.invalidate(status === 'stale' ? 'PREVIEW_NOT_READY' : 'RUNTIME_CHANGED')
    readiness.retire('Runtime document retired')
    channels.close()
    owner.close()
    readyIds.clear()
    states.clear()
    viewports = []
    sandboxViewports = []
    if (!keepFrame) {
      iframe.remove()
      stalePreview.restore()
    }
    if (status === 'absent') selected = null
    if (publishNow) publish(status)
  }
  /** New document minted before assigning src; WindowProxy equality cannot resurrect predecessor. */
  function navigate(target: HistoireTarget) {
    requests.invalidate()
    readiness.retire('Runtime document replaced')
    selected = target
    sourceOwner.capture(context.session.getSnapshot(), target)
    owner.replace(createRuntimeDocumentId(context.bridge.getOwner().mountId), target)
    loading.navigate()
    stalePreview.restore()
    states = new Map()
    viewports = []
    sandboxViewports = []
    mounting()
    const url = new URL('__sandbox.html', base)
    url.searchParams.set('storyId', target.storyId)
    url.searchParams.set('variantId', target.variantId!)
    url.searchParams.set('grid', String(layout === 'grid'))
    url.searchParams.set('documentId', owner.id!)
    url.searchParams.set('selectionVersion', String(owner.selectionVersion))
    url.searchParams.set('embed', 'true')
    if (context.standalone) url.searchParams.set('standalone', 'true')
    if (context.standalone && base.searchParams.get('matrix') === 'true') url.searchParams.set('matrix', 'true')
    iframe.src = url.href
    if (!iframe.isConnected) context.container.append(iframe)
    settings()
  }
  /** Failed mount settles ready promptly while preserving explicit teardown ownership. */
  function fail(error: unknown) {
    if (!active || !owner.id) return
    requests.invalidate('PREVIEW_NOT_READY')
    publish('failed')
    readiness.fail(error)
  }
  /** Session intent drives existing runtime; no router or independent controller. */
  function synchronize() {
    if (!active || retired) return
    const target = context.session.getSnapshot().selection
    if (!target?.variantId) {
      const retained = stalePreview.retained
      const keepFrame = stalePreview.retain(context.session.getSnapshot(), selected)
      if (owner.id || (retained && !keepFrame)) {
        retireRuntime(keepFrame ? 'stale' : 'absent', keepFrame)
      }
      return
    }
    if (!owner.id || target.storyId !== selected?.storyId || (layout === 'single' && !context.standalone && target.variantId !== selected?.variantId) || sourceOwner.changed(context.session.getSnapshot(), target)) {
      navigate(target)
    }
    else if (target.variantId !== selected?.variantId) {
      requests.invalidate()
      selected = target
      owner.select(target)
      if (layout === 'single') {
        // Source cache retains variant state; each rendered actor must acknowledge new intent.
        mounting()
        post({ type: PREVIEW_SYNC, ...target, grid: false, selectionVersion: owner.selectionVersion })
      }
      else {
        post({ type: SELECT_VARIANT, variantId: target.variantId, selectionVersion: owner.selectionVersion })
        publish(readyIds.has(target.variantId) ? 'ready' : 'mounting')
        publishState()
      }
    }
    settings()
  }
  /** Both origin/frame and parent-minted document checked before every reply/event. */
  function receive(event: MessageEvent) {
    if (!active || !owner.id || event.source !== iframe.contentWindow || event.origin !== window.location.origin || !event.data?.__histoire) return
    const message = event.data
    if (message.documentId !== owner.id) return
    if (context.standalone && layout === 'single' && message.selectionVersion !== owner.selectionVersion) return
    if (message.type === RUNTIME_FAILED) {
      fail(new HistoireSdkError('PREVIEW_NOT_READY', message.error?.message ?? 'Story mount failed'))
      return
    }
    if (!owner.accepts(message, [RUNTIME_LAYOUT, STATE_SYNC, VARIANT_READY, EVENT_SEND, SELECT_VARIANT, HOST_CHANNEL_MESSAGE].includes(message.type))) return
    if ((message.type === STATE_SYNC || message.type === VARIANT_READY) && !context.session.getSnapshot().catalog.stories.some(story => story.id === message.storyId && story.variants.some(variant => variant.id === message.variantId))) return
    if (message.type === HOST_CHANNEL_MESSAGE) {
      channels.receive(message)
    }
    else if (message.type === STATE_SYNC) {
      try {
        const state = { target: { storyId: message.storyId, variantId: message.variantId }, runtimeId: owner.id, value: message.state }
        validateWireValue(state, { kind: 'event', name: 'state.changed' })
        validateHistoireStateSnapshot(state)
      }
      catch { return }
      states.set(message.variantId, message.state)
      publishState()
    }
    else if (message.type === VARIANT_READY) {
      readyIds.add(message.variantId)
      refreshLayout()
      if (message.variantId === selected?.variantId) {
        stalePreview.remember(context.session.getSnapshot(), selected)
        const runtime = publish('ready')
        publishState()
        readiness.ready(runtime)
      }
    }
    else if (message.type === RUNTIME_LAYOUT) {
      try {
        validateWireValue({ viewports: message.viewports }, { kind: 'event', name: 'layout.changed' })
        validateHistoireViewports(message.viewports)
      }
      catch { return }
      // Layout can arrive before VARIANT_READY; retain it until its real runtime acknowledges.
      sandboxViewports = message.viewports.filter((viewport: HistoireViewport) => viewport.target.storyId === selected?.storyId && context.session.getSnapshot().catalog?.stories.some(story => story.id === viewport.target.storyId && story.variants.some(variant => variant.id === viewport.target.variantId)))
      refreshLayout()
    }
    else if ([RUNTIME_RESULT, TEST_DEFINITIONS, TEST_RESULT].includes(message.type)) {
      requests.receive(message)
    }
    else if (message.type === EVENT_SEND && readyIds.has(message.variantId)) {
      const target = { storyId: message.storyId, variantId: message.variantId }
      try {
        context.bridge.post('events.appended', { items: [{ sequence: ++eventCounter, timestamp: Date.now(), target, runtimeId: owner.id, payload: message.event }] }, { runtimeId: owner.id!, target: selected! })
      }
      catch { context.bridge.post('events.appended', { items: [], droppedCount: 1 }, { runtimeId: owner.id!, target: selected! }) }
    }
    else if (message.type === RUNTIME_FOCUS && typeof message.focused === 'boolean' && (message.action === undefined || message.action === 'search')) {
      context.bridge.post('focus.changed', { focused: message.focused, ...(message.action ? { action: message.action } : {}) }, { runtimeId: owner.id!, target: selected! })
    }
    else if (message.type === SELECT_VARIANT && owner.acceptsSelection(message) && readyIds.has(message.variantId) && context.session.getSnapshot().catalog.stories.some(story => story.id === message.storyId && story.variants.filter(variant => variant.id === message.variantId).length === 1)) {
      void context.session.selection.select({ storyId: message.storyId, variantId: message.variantId }).catch(() => {})
    }
  }
  window.addEventListener('message', receive)
  iframe.addEventListener('load', loading.loaded)
  const resize = new ResizeObserver(refreshLayout)
  resize.observe(iframe)
  resize.observe(context.container)
  window.addEventListener('resize', refreshLayout)
  document.addEventListener('scroll', refreshLayout, true)
  const unsubscribe = context.session.subscribe(synchronize)
  synchronize()
  return {
    /** Empty/docs-only primary owns slot without executing modules. */
    get ready(): Promise<HistoireRuntimeSnapshot | void> { return owner.id ? readiness.promise : Promise.resolve() },
    /** Strict runtime methods; selection/settings return null acknowledgment. */
    async request(command: string, payload: any, capture: HistoireRequestCapture) {
      capture.signal.throwIfAborted()
      if (command === 'selection.select') synchronize()
      if (stalePreview.retained) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Retained preview has no active runtime')
      if (command === 'selection.select') {
        if (owner.id) await readiness.promise
        return null
      }
      if (command === 'settings.update') {
        settings()
        return null
      }
      if (command === 'events.clear') return null
      if (!owner.id || capture.runtimeId !== owner.id || capture.target?.storyId !== selected?.storyId || capture.target?.variantId !== selected?.variantId) throw new HistoireSdkError('RUNTIME_CHANGED', 'Runtime request owner changed')
      if (!readyIds.has(selected!.variantId!)) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Selected runtime unavailable')
      if (command === 'channel.post') channels.admit(payload)
      const result = command === 'tests.collect' || command === 'tests.run'
        ? await tests.request(command, capture)
        : await requests.request(RUNTIME_REQUEST, { command, payload }, capture)
      if (capture.runtimeId !== owner.id || !active || capture.target?.storyId !== selected?.storyId || capture.target?.variantId !== selected?.variantId) throw new HistoireSdkError('RUNTIME_CHANGED', 'Runtime response owner changed')
      if (command.startsWith('state.')) return { target: capture.target, runtimeId: capture.runtimeId, value: result }
      if (command === 'source.get') return { ...payload, epoch: capture.epoch, revision: capture.revision, ...result }
      return result
    },
    /** Mark inactive before removing document and rejecting pending calls. */
    close() {
      if (!active) return
      active = false
      unsubscribe()
      retireRuntime('absent', false, false)
      window.removeEventListener('message', receive)
      window.removeEventListener('resize', refreshLayout)
      document.removeEventListener('scroll', refreshLayout, true)
      resize.disconnect()
      cancelAnimationFrame(scheduledLayout)
      iframe.removeEventListener('load', loading.loaded)
      iframe.remove()
    },
  }
}
