<script setup lang="ts">
import type { HistoireSession } from '@histoire/sdk'
import { subscribeHistoireMountEvents } from '@histoire/sdk/internal'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { focusHistoireSearch, requestHistoireUiShow, requestHistoireUiToggle, useHistoireContext } from '@histoire/vue/internal'
import { useEventListener } from '@vueuse/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasFrameState, useCanvasStore } from '../../composables/canvas-settings.js'
import { useMatrixStore } from '../../stores/matrix.js'
import { createCanvasPropsOverrideController } from './frame-props-override.js'
import { createCanvasReplicaSession } from './frame-replica.js'
import { createCanvasPropsRequestId } from './frame-requests.js'
import { type CanvasStartupRequest, useCanvasStartupCoordinator } from './frame-startup-coordinator.js'
import { createCanvasReplicaTargetSelector, createCanvasStartupReadiness, observeCanvasStartupRuntime, waitForCanvasStartup } from './frame-startup-lifecycle.js'
import { useCanvasContentSizing } from './useCanvasContentSizing.js'

const props = defineProps<{
  /** Stable canvas frame identifier. */
  frameId: string
  /** Exact collected target. */
  storyId: string
  variantId: string
  /** Configured standalone source base, independent of route. */
  previewBase: string
  /** Native Single dimensions, already resolved for orientation. */
  viewport?: { width: number, height: number }
  /** Matrix cell prop projection; never writes into canonical session. */
  propsOverride?: Record<string, unknown>
}>()
const emit = defineEmits<{ status: [status: 'loading' | 'ready' | 'error', error?: unknown] }>()
const canonical = useHistoireSession()
const context = useHistoireContext()
const snapshot = useHistoireSnapshot()
const store = useCanvasStore()
const registry = useCanvasFrames()
const frameState = useCanvasFrameState()
const matrix = useMatrixStore()
const startupCoordinator = useCanvasStartupCoordinator()
const container = ref<HTMLElement>()
const ready = ref(false)
let replica: HistoireSession | undefined
let closing = false
let generation = 0
let connected = false
let directController: AbortController | undefined
let directStartup: Promise<void> | undefined
let stop = () => {}
let stopFocus = () => {}
let closeObserver = () => {}
let startupRequest: CanvasStartupRequest | undefined
let overrideDocument = ''
const targetSelector = createCanvasReplicaTargetSelector({
  activation: () => ({
    session: replica,
    generation,
    target: { storyId: props.storyId, variantId: props.variantId },
    connected,
    closing,
  }),
  settings,
  loading,
  fail,
})
const propsOverride = createCanvasPropsOverrideController({
  frames: registry,
  frameId: () => props.frameId,
  projection: () => ({ variantId: props.variantId, props: props.propsOverride }),
  nextRequestId: createCanvasPropsRequestId(),
  fail,
})
const contentSizing = useCanvasContentSizing({ canvas: store, canonical, snapshot, container, ready, target: () => props, wait: propsOverride.wait })

/** Apply canonical settings and frame-local presentation overrides. */
function settings() {
  const value = snapshot.value.settings
  const background = store.frameBackgrounds[props.frameId]
  const viewport = contentSizing.size.value ?? props.viewport
  return { ...value, ...(background ?? {}), ...(viewport ? { responsiveWidth: viewport.width, responsiveHeight: viewport.height, rotate: false } : {}) }
}

/** Publish iframe identity for finite measure and comment requests. */
function registerDocument(available = false) {
  const entry = registry.getFrame(props.frameId)
  const iframe = container.value?.querySelector('iframe')
  if (!entry || !iframe) return
  iframe.setAttribute('data-test-id', 'preview-iframe-passive')
  entry.iframe = iframe
  entry.documentId = available ? new URL(iframe.src).searchParams.get('documentId') : null
  entry.session = available ? replica : undefined
}

/** Register loading geometry without granting runtime authority. */
function loading(): void {
  ready.value = false
  registerDocument()
  emit('status', 'loading')
}

/** Keep failure local and release inspector/document authority. */
function fail(error?: unknown): void {
  ready.value = false
  registerDocument()
  emit('status', 'error', error)
}

/** Queue Grid/List acquisition; keep Single and Matrix lifetimes direct. */
async function start(): Promise<void> {
  startupRequest?.cancel()
  startupRequest = undefined
  directController?.abort()
  const previousDirect = directStartup
  const version = ++generation
  loading()
  const direct = !startupCoordinator || !!props.propsOverride || !!props.viewport || store.arrangement === 'single'
  if (direct) {
    const controller = new AbortController()
    directController = controller
    const pending = (async () => {
      if (previousDirect) await previousDirect
      if (closing || version !== generation) return
      await startOwned(version, controller.signal)
    })()
    const owned = pending.catch(() => {})
    directStartup = owned
    await owned
    if (directStartup === owned) directStartup = undefined
    if (directController === controller) directController = undefined
    return
  }
  const request = startupCoordinator.request(props.frameId, async (signal) => {
    if (previousDirect) await previousDirect
    signal.throwIfAborted()
    await startOwned(version, signal)
  })
  startupRequest = request
  try {
    await request.completion
  }
  catch {}
}

/** Acquire session and finish only after restored host readiness. */
async function startOwned(version: number, signal: AbortSignal): Promise<void> {
  const readiness = createCanvasStartupReadiness(signal)
  let current: HistoireSession | undefined
  connected = false
  targetSelector.invalidate()
  try {
    signal.throwIfAborted()
    stop()
    stopFocus()
    closeObserver()
    const previous = replica
    replica = undefined
    if (previous) await previous.dispose()
    signal.throwIfAborted()
    if (closing || version !== generation || !container.value) return
    current = createCanvasReplicaSession(canonical, props.previewBase, { matrix: !!props.propsOverride, nativeScroll: !!props.viewport })
    replica = current
    await waitForCanvasStartup(current.connect(), signal)
    if (closing || version !== generation) return
    connected = true
    await waitForCanvasStartup(targetSelector.select(true, false), signal)
    if (closing || version !== generation || !container.value) return
    const observer = !props.propsOverride ? matrix.registerRuntimeObserver() : undefined
    closeObserver = () => observer?.close()
    stop = observeCanvasStartupRuntime({
      owner: current,
      canonical,
      state: props.propsOverride ? undefined : frameState,
      target: () => ({ storyId: props.storyId, variantId: props.variantId }),
      document: () => container.value?.querySelector('iframe')?.contentDocument,
      isCurrent: () => !closing && version === generation && replica === current,
      isStartupPending: () => !ready.value,
      loading,
      error(error) {
        fail(error)
        readiness.fail(error)
      },
      startupFailure: error => readiness.fail(error),
      ready(value) {
        observer?.capture(value)
        registerDocument(true)
        if (value.runtime.runtimeId && value.runtime.runtimeId !== overrideDocument) {
          overrideDocument = value.runtime.runtimeId
          propsOverride.update()
        }
        ready.value = true
        contentSizing.refresh()
        emit('status', 'ready')
        readiness.ready()
      },
    })
    const mount = current.mount(container.value, { surface: 'preview' })
    // Generation guards keep retired mounts from targeting their former provider chrome.
    stopFocus = subscribeHistoireMountEvents(mount, (event) => {
      if (closing || version !== generation || replica !== current || event.event !== 'focus.changed') return
      const action = (event.payload as { action?: string }).action
      if (action === 'search') focusHistoireSearch(context.root.value)
      else if (action === 'toggle-ui') requestHistoireUiToggle(context.root.value)
      else if (action === 'show-ui') requestHistoireUiShow(context.root.value)
    })
    const intent = targetSelector.currentIntent()
    const mounted = mount.ready.catch((error) => {
      // A new selection owns its own readiness; the initial mount promise retires.
      if (intent === targetSelector.currentIntent()) throw error
    })
    await waitForCanvasStartup(Promise.all([mounted, readiness.promise]).then(() => {}), signal)
  }
  catch (error) {
    readiness.fail(error)
    if (current && replica === current) {
      stop()
      stop = () => {}
      stopFocus()
      stopFocus = () => {}
      closeObserver()
      closeObserver = () => {}
      replica = undefined
      connected = false
      await current.dispose().catch(() => {})
    }
    if (!signal.aborted && !closing && version === generation) fail(error)
    throw error
  }
  finally {
    readiness.dispose()
  }
}

watch(settings, () => {
  if (connected) void replica?.settings.update(settings()).catch(() => {})
}, { deep: true })
watch(() => [props.storyId, props.variantId], () => void targetSelector.select())
watch(() => props.propsOverride, propsOverride.update, { deep: true })
useEventListener('message', propsOverride.receive)
onMounted(() => void start())
onBeforeUnmount(() => {
  startupRequest?.cancel()
  startupRequest = undefined
  directController?.abort()
  directController = undefined
  closing = true
  generation++
  stop()
  stopFocus()
  closeObserver()
  propsOverride.dispose()
  const entry = registry.getFrame(props.frameId)
  if (entry?.iframe && container.value?.contains(entry.iframe)) {
    entry.iframe = null
    entry.documentId = null
    entry.session = undefined
  }
  void replica?.dispose().catch(() => {})
})
/** Wait for current prop acknowledgement before dynamic code generation. */
async function getSource() {
  await propsOverride.wait()
  if (!replica || closing) throw new Error('Variant unavailable.')
  return (await replica.source.get({ storyId: props.storyId, variantId: props.variantId, mode: 'dynamic' })).body
}
defineExpose({ retry: start, getSource })
</script>

<template>
  <div ref="container" class="histoire-canvas-replica" :aria-busy="!ready" :inert="!ready ? true : undefined" />
</template>

<style scoped>
/* Keep a dark host from painting light story iframes opaque. */
.histoire-canvas-replica { width: 100%; height: 100%; color-scheme: normal; }
</style>
