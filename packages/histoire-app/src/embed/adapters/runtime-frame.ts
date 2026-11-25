import type { HistoireInspectionCapabilities, HistoireRuntimeSnapshot, HistoireStateSnapshot, HistoireTarget, HistoireViewport } from '@histoire/protocol'
import type { HistoireRequestCapture } from '@histoire/sdk/internal'
import type { EmbedSurfaceContext } from '../surfaces.js'
import { COLLECT_TESTS, EVENT_SEND, HistoireSdkError, HOST_CHANNEL_MESSAGE, PREVIEW_SETTINGS_SYNC, PREVIEW_SYNC, RUNTIME_FAILED, RUNTIME_FOCUS, RUNTIME_LAYOUT, RUNTIME_REQUEST, RUNTIME_RESULT, STATE_SYNC, TEST_DEFINITIONS, TEST_RESULT, validateHistoireStateSnapshot, validateHistoireViewports, validateInspectionCapabilities, validateWireValue, VARIANT_READY } from '@histoire/protocol'
import { createEmbedHostChannels } from './channels.js'
import { createRuntimeDocumentId, createRuntimeDocumentOwner } from './document.js'
import { mapRuntimeViewport } from './geometry.js'
import { createRuntimeLayoutScheduler } from './runtime-layout.js'
import { createRuntimeLoadRecovery } from './runtime-loading.js'
import { createRuntimeReadiness } from './runtime-readiness.js'
import { cancelRuntimeInspection, createRuntimeRequests } from './runtime-requests.js'
import { createRuntimeRevisionOwner } from './runtime-revision.js'
import { createRuntimeFrameUrl, createTestWorkerUrl } from './sandbox-urls.js'
import { createStalePreview } from './stale-preview.js'
import { createEmbedTestWorkers } from './test-workers.js'
import { createEmbedPreviewTests } from './tests.js'

/** Existing same-origin story sandbox, owned by one parent-backed primary surface. */
export function createEmbedRuntimeFrame(context: EmbedSurfaceContext) {
  const owner = createRuntimeDocumentOwner()
  const iframe = context.container.ownerDocument.createElement('iframe')
  context.container.style.cssText = 'margin:0;width:100%;height:100%;overflow:auto;display:flex;align-items:flex-start;'
  iframe.title = 'Histoire variant'
  iframe.style.cssText = 'border:0;display:block;flex:none;max-width:100%;'
  const base = new URL(context.sourceBase ?? './', window.location.href)
  const stalePreview = createStalePreview(iframe, context.standalone)
  const sourceOwner = createRuntimeRevisionOwner()
  let active = true
  let retired = false
  let eventCounter = 0
  let selected: HistoireTarget | null = null
  let inspection: HistoireInspectionCapabilities = {}
  let highlightGrants = { highlight: false, highlightLease: false, componentHighlight: false }
  const readyIds = new Set<string>()
  let states = new Map<string, Record<string, any>>()
  let viewports: HistoireViewport[] = []
  let sandboxViewports: HistoireViewport[] = []
  let appliedSettings: { settings: unknown, document: string | null } | undefined
  /** Wrapper scrolling/resize changes offsets even when child content stays fixed. */
  const layoutScheduler = createRuntimeLayoutScheduler(iframe, { active: () => active && !!owner.id, measure: measureLayout })
  const refreshLayout = layoutScheduler.refresh
  const readiness = createRuntimeReadiness(context.descriptor.config.storyCollectTimeout ?? 30_000, fail)
  const requests = createRuntimeRequests(post, Math.max(context.descriptor.config.runTimeout ?? 300_000, context.descriptor.config.storyCollectTimeout ?? 30_000))
  const testWorkers = createEmbedTestWorkers({
    container: context.container,
    maxWorkers: context.descriptor.config.testMaxWorkers ?? 1,
    timeoutMs: context.descriptor.config.runTimeout ?? 300_000,
    createDocumentId: () => createRuntimeDocumentId(context.bridge.getOwner().mountId),
    createUrl: (target, documentId) => createTestWorkerUrl(base, target, documentId),
  })
  const loading = createRuntimeLoadRecovery(settings, () => active && !retired && owner.id && selected && context.standalone ? owner.selectionVersion : null, () => {
    requests.invalidate()
    states.clear()
    owner.select(selected!, true)
    mounting(true)
    post({ type: PREVIEW_SYNC, ...selected!, selectionVersion: owner.selectionVersion })
  }, () => post({ type: PREVIEW_SYNC, ...selected!, selectionVersion: owner.selectionVersion }), {
    failed: () => !iframe.contentDocument,
    // Same URL and document identity: pending readiness stays valid, and the
    // load after it restores later intent like any physical reload.
    renavigate: () => {
      if (!active || retired || !owner.id) return
      const src = iframe.src
      loading.navigate()
      iframe.src = src
    },
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
  }, async (capture) => {
    const collected = await requests.request(COLLECT_TESTS, { command: 'tests.collect' }, capture)
    if (collected.error) throw new HistoireSdkError('COLLECTION_FAILED', collected.error.message ?? String(collected.error))
    return await testWorkers.run(capture, collected.definitions ?? [])
  })

  /** Sandbox remains same-origin with wrapper; outer cross-origin bridge stays separate. */
  function post(message: Record<string, unknown>) {
    if (active && owner.id) iframe.contentWindow?.postMessage({ __histoire: true, ...message, documentId: owner.id }, window.location.origin)
  }
  /** Portable runtime status aliases currently selected visible content cell. */
  function snapshot(status: HistoireRuntimeSnapshot['status']): HistoireRuntimeSnapshot {
    return { status, mountId: context.bridge.getOwner().mountId, runtimeId: owner.id, viewports, viewport: viewports.find(viewport => viewport.target.variantId === selected?.variantId) ?? null, ...(status === 'ready' ? { inspection } : {}) }
  }
  /** Runtime identity transitions reach parent before state/layout of replacement. */
  function publish(status: HistoireRuntimeSnapshot['status']) {
    const runtime = snapshot(status)
    layoutScheduler.reset()
    context.bridge.post('readiness.changed', { runtime }, { runtimeId: owner.id ?? undefined, target: selected ?? undefined })
    return runtime
  }
  /** Selected actor must acknowledge before requests resume. */
  function mounting(retainPending = false) {
    readyIds.clear()
    inspection = {}
    readiness.reset(retainPending)
    publish('mounting')
  }
  /** Only selected runtime state is host mirror. */
  function publishState() {
    const value = selected?.variantId ? states.get(selected.variantId) : undefined
    if (!value || !selected || !owner.id || !readyIds.has(selected.variantId!)) return
    const state: HistoireStateSnapshot = { target: selected, runtimeId: owner.id, value }
    context.bridge.post('state.changed', state, { runtimeId: owner.id, target: selected })
  }
  /** Map sandbox viewports into host coordinates; unchanged results are not republished. */
  function measureLayout() {
    if (!owner.id) return
    const runtimeId = owner.id
    const target = selected!
    const rect = iframe.getBoundingClientRect()
    viewports = iframe.clientWidth && iframe.clientHeight ? sandboxViewports.filter(viewport => readyIds.has(viewport.target.variantId!)).map(viewport => mapRuntimeViewport(viewport, rect, { width: iframe.clientWidth, height: iframe.clientHeight }, { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })).filter(Boolean) : []
    const published = viewports
    return { key: JSON.stringify([runtimeId, target, published]), post: () => context.bridge.post('layout.changed', { viewports: published }, { runtimeId, target }) }
  }
  /** Logical responsive dimensions belong to actual sandbox; `force` resends unchanged settings. */
  function settings(force = true) {
    const value = context.session.getSnapshot().settings
    // Snapshot settings keep identity until they change, so unrelated publications skip the post.
    if (!force && appliedSettings?.settings === value && appliedSettings.document === owner.id) return
    appliedSettings = { settings: value, document: owner.id }
    const width = value.rotate && value.responsiveHeight ? value.responsiveHeight : value.responsiveWidth
    const height = value.rotate ? value.responsiveWidth : value.responsiveHeight
    iframe.style.width = `${width}px`
    iframe.style.height = height ? `${height}px` : '100%'
    iframe.style.minHeight = height ? '' : '240px'
    post({ type: PREVIEW_SETTINGS_SYNC, settings: value })
  }
  /** Revoke document, requests and channels before retaining pixels or removing DOM. */
  function retireRuntime(status: 'stale' | 'absent', keepFrame = false, publishNow = true) {
    if (keepFrame && owner.id && selected) post({ type: RUNTIME_REQUEST, command: 'inspection.revoke', payload: { highlight: false, highlightLease: false, componentHighlight: false }, ...selected })
    testWorkers.cancel()
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
  /** Mount override first, then the story layout, then the project default; embeds draw no aligners. */
  function embedPadding(target: HistoireTarget): number {
    const story = context.session.getSnapshot().catalog.stories.find(item => item.id === target.storyId)
    return context.padding ?? story?.layout?.padding ?? context.descriptor.config?.framePadding ?? 0
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
    iframe.src = createRuntimeFrameUrl(base, { target, documentId: owner.id!, selectionVersion: owner.selectionVersion, standalone: context.standalone, padding: embedPadding(target) })
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
    const snapshot = context.session.getSnapshot()
    const grants = { highlight: snapshot.inspection?.highlight?.available === true, highlightLease: snapshot.inspection?.highlightLease?.available === true, componentHighlight: snapshot.inspection?.componentHighlight?.available === true }
    if (owner.id && selected && ((highlightGrants.highlight && !grants.highlight) || (highlightGrants.highlightLease && !grants.highlightLease) || (highlightGrants.componentHighlight && !grants.componentHighlight))) post({ type: RUNTIME_REQUEST, command: 'inspection.revoke', payload: grants, ...selected })
    highlightGrants = grants
    const target = snapshot.selection
    if (!target?.variantId) {
      const retained = stalePreview.retained
      const keepFrame = stalePreview.retain(context.session.getSnapshot(), selected)
      if (owner.id || (retained && !keepFrame)) {
        retireRuntime(keepFrame ? 'stale' : 'absent', keepFrame)
      }
      return
    }
    if (!owner.id || target.storyId !== selected?.storyId || (!context.standalone && target.variantId !== selected?.variantId) || sourceOwner.changed(context.session.getSnapshot(), target)) {
      navigate(target)
    }
    else if (target.variantId !== selected?.variantId) {
      requests.invalidate()
      selected = target
      owner.select(target)
      // Source cache retains variant state; rendered actor must acknowledge new intent.
      mounting()
      post({ type: PREVIEW_SYNC, ...target, selectionVersion: owner.selectionVersion })
    }
    settings(false)
  }
  /** Both origin/frame and parent-minted document checked before every reply/event. */
  function receive(event: MessageEvent) {
    if (!active || !owner.id || event.source !== iframe.contentWindow || event.origin !== window.location.origin || !event.data?.__histoire) return
    const message = event.data
    if (message.documentId !== owner.id) return
    if (context.standalone && message.selectionVersion !== owner.selectionVersion) {
      if (message.type === VARIANT_READY && message.variantId === selected?.variantId) loading.missed()
      return
    }
    if (message.type === RUNTIME_FAILED) {
      fail(new HistoireSdkError('PREVIEW_NOT_READY', message.error?.message ?? 'Story mount failed'))
      return
    }
    if (!owner.accepts(message, [RUNTIME_LAYOUT, STATE_SYNC, VARIANT_READY, EVENT_SEND, HOST_CHANNEL_MESSAGE, RUNTIME_RESULT].includes(message.type))) return
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
        try {
          inspection = validateInspectionCapabilities(message.inspectionCapabilities ?? {})
        }
        catch { inspection = {} }
        loading.restored()
        stalePreview.remember(context.session.getSnapshot(), selected)
        const runtime = publish('ready')
        publishState()
        readiness.ready(runtime)
      }
    }
    else if (message.type === 'histoire:inspection-capabilities' && message.variantId === selected?.variantId && readyIds.has(message.variantId)) {
      try {
        inspection = validateInspectionCapabilities(message.inspectionCapabilities)
      }
      catch { inspection = {} }
      publish('ready')
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
    else if (message.type === RUNTIME_FOCUS && typeof message.focused === 'boolean' && (message.action === undefined || message.action === 'search' || message.action === 'toggle-ui' || message.action === 'show-ui')) {
      context.bridge.post('focus.changed', { focused: message.focused, ...(message.action ? { action: message.action } : {}) }, { runtimeId: owner.id!, target: selected! })
    }
  }
  window.addEventListener('message', receive)
  iframe.addEventListener('load', loading.loaded)
  const resize = new ResizeObserver(refreshLayout)
  resize.observe(iframe)
  resize.observe(context.container)
  const unsubscribe = context.session.subscribe(synchronize)
  synchronize()
  return {
    /** Rejecting a late highlight result still releases its exact overlay. */
    cancelInspection(capture: HistoireRequestCapture) {
      if (capture.requestId && capture.runtimeId === owner.id && active) cancelRuntimeInspection(post, capture, capture.requestId)
    },
    /** Empty/docs-only primary owns slot without executing modules. */
    get ready(): Promise<HistoireRuntimeSnapshot | void> { return owner.id ? readiness.promise : Promise.resolve() },
    /** Strict runtime methods; selection/settings return null acknowledgment. */
    async request(command: string, payload: any, capture: HistoireRequestCapture) {
      capture.signal.throwIfAborted()
      if (command === 'selection.select') synchronize()
      if (stalePreview.retained) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Variant is no longer active.')
      if (command === 'selection.select') {
        if (owner.id) await readiness.promise
        return null
      }
      if (command === 'settings.update') {
        settings()
        return null
      }
      if (command === 'events.clear') return null
      const inspection = command.startsWith('inspection.')
      if (!owner.id || capture.runtimeId !== owner.id || capture.target?.storyId !== selected?.storyId || (!inspection && capture.target?.variantId !== selected?.variantId)) throw new HistoireSdkError('RUNTIME_CHANGED', 'Runtime request owner changed')
      if (!capture.target?.variantId || !readyIds.has(capture.target.variantId)) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Runtime unavailable')
      if (command === 'channel.post') channels.admit(payload)
      const result = command === 'tests.collect' || command === 'tests.run'
        ? await tests.request(command, capture)
        : await requests.request(RUNTIME_REQUEST, { command, payload }, capture)
      if (capture.runtimeId !== owner.id || !active || capture.target?.storyId !== selected?.storyId || !readyIds.has(capture.target?.variantId ?? '') || (!inspection && capture.target?.variantId !== selected?.variantId)) throw new HistoireSdkError('RUNTIME_CHANGED', 'Runtime response owner changed')
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
      testWorkers.close()
      window.removeEventListener('message', receive)
      layoutScheduler.close()
      resize.disconnect()
      iframe.removeEventListener('load', loading.loaded)
      loading.dispose()
      iframe.remove()
    },
  }
}
