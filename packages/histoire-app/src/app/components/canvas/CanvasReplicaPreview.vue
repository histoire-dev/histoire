<script setup lang="ts">
import type { HistoireSession } from '@histoire/sdk'
import { PROPS_OVERRIDE, RUNTIME_RESULT } from '@histoire/shared'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasFrameState, useCanvasStore } from '../../composables/canvas-settings.js'
import { useMatrixStore } from '../../stores/matrix.js'
import { createCanvasReplicaSession } from './frame-replica.js'
import { createCanvasPropsRequestId } from './frame-requests.js'

const props = defineProps<{
  /** Stable canvas frame identifier. */
  frameId: string
  /** Exact collected target. */
  storyId: string
  variantId: string
  /** Configured standalone source base, independent of route. */
  previewBase: string
  /** Matrix cell prop projection; never writes into canonical session. */
  propsOverride?: Record<string, unknown>
}>()
const emit = defineEmits<{ status: [status: 'loading' | 'ready' | 'error', error?: unknown] }>()
const canonical = useHistoireSession()
const snapshot = useHistoireSnapshot()
const store = useCanvasStore()
const registry = useCanvasFrames()
const frameState = useCanvasFrameState()
const matrix = useMatrixStore()
const container = ref<HTMLElement>()
let replica: HistoireSession | undefined
let closing = false
let generation = 0
let stop = () => {}
let closeObserver = () => {}
let propsRequest = ''
let propsTimeout: ReturnType<typeof setTimeout> | undefined
let propsReady = Promise.resolve()
let resolveProps = () => {}
let rejectProps = (_error: unknown) => {}
let overrideDocument = ''
const nextPropsRequestId = createCanvasPropsRequestId()

/** Canonical settings seed passive runtime without exposing passive state to inspector. */
function settings() {
  const value = snapshot.value.settings
  const background = store.frameBackgrounds[props.frameId]
  return { ...value, ...(background ?? {}) }
}

/** Publish actual iframe identity for finite measure/comment requests. */
function registerDocument() {
  const entry = registry.getFrame(props.frameId)
  const iframe = container.value?.querySelector('iframe')
  if (!entry || !iframe) return
  iframe.setAttribute('data-test-id', 'preview-iframe-passive')
  entry.iframe = iframe
  entry.documentId = replica?.getSnapshot().runtime.status === 'ready' ? new URL(iframe.src).searchParams.get('documentId') : null
  entry.session = replica
}

/** Matrix feature replies must belong to this currently registered document. */
function receive(event: MessageEvent) {
  const frame = registry.getFrame(props.frameId)
  if (!propsRequest || event.source !== frame?.iframe?.contentWindow || event.origin !== window.location.origin || !event.data?.__histoire || event.data.documentId !== frame.documentId) return
  if (event.data.type !== RUNTIME_RESULT || event.data.requestId !== propsRequest) return
  clearTimeout(propsTimeout)
  propsRequest = ''
  if (event.data.error || !event.data.result?.supported) {
    const error = new Error('Props matrix unavailable in this preview runtime')
    rejectProps(error)
    emit('status', 'error', error)
  }
  else {
    resolveProps()
  }
}

/** Complete override set restores removed prop values in source-owned runtime. */
function overrideProps() {
  if (!props.propsOverride) return
  clearTimeout(propsTimeout)
  rejectProps(new Error('Props override superseded'))
  propsReady = new Promise<void>((resolve, reject) => {
    resolveProps = resolve
    rejectProps = reject
  })
  void propsReady.catch(() => {})
  propsRequest = nextPropsRequestId()
  if (!registry.postToFrame(props.frameId, { type: PROPS_OVERRIDE, variantId: props.variantId, props: props.propsOverride, requestId: propsRequest })) {
    rejectProps(new Error('Preview unavailable'))
    return
  }
  propsTimeout = setTimeout(() => {
    propsRequest = ''
    const error = new Error('Props matrix unavailable in this preview runtime')
    rejectProps(error)
    emit('status', 'error', error)
  }, 3000)
}

/** Each retry closes previous source/session before acquiring another document. */
async function start() {
  const version = ++generation
  emit('status', 'loading')
  try {
    stop()
    closeObserver()
    const previous = replica
    replica = undefined
    if (previous) await previous.dispose()
    if (closing || version !== generation || !container.value) return
    const current = createCanvasReplicaSession(canonical, props.previewBase, { matrix: !!props.propsOverride })
    replica = current
    await current.connect()
    if (closing || version !== generation) return
    await current.selection.select({ storyId: props.storyId, variantId: props.variantId })
    await current.settings.update(settings())
    if (closing || version !== generation || !container.value) return
    const observer = !props.propsOverride ? matrix.registerRuntimeObserver() : undefined
    closeObserver = () => observer?.close()
    stop = current.subscribe((value) => {
      if (closing || version !== generation) return
      observer?.capture(value)
      registerDocument()
      emit('status', value.runtime.status === 'ready' ? 'ready' : value.runtime.status === 'failed' ? 'error' : 'loading')
      if (value.runtime.status === 'ready' && value.runtime.runtimeId && value.runtime.runtimeId !== overrideDocument) {
        overrideDocument = value.runtime.runtimeId
        overrideProps()
      }
    })
    const mount = current.mount(container.value, { surface: 'preview' })
    await mount.ready
    if (closing || version !== generation) return
    observer?.capture(current.getSnapshot())
    // Fresh display replicas receive last canonical edit for their own exact target only.
    if (!props.propsOverride) await frameState?.seed(current, { storyId: props.storyId, variantId: props.variantId })
    if (closing || version !== generation) return
    registerDocument()
    emit('status', 'ready')
  }
  catch (error) {
    if (!closing && version === generation) emit('status', 'error', error)
  }
}

watch(settings, () => {
  void replica?.settings.update(settings()).catch(() => {})
}, { deep: true })
watch(() => props.propsOverride, overrideProps, { deep: true })
onMounted(() => {
  window.addEventListener('message', receive)
  void start()
})
onBeforeUnmount(() => {
  closing = true
  generation++
  stop()
  closeObserver()
  clearTimeout(propsTimeout)
  rejectProps(new Error('Preview detached'))
  window.removeEventListener('message', receive)
  const entry = registry.getFrame(props.frameId)
  if (entry?.iframe && container.value?.contains(entry.iframe)) {
    entry.iframe = null
    entry.documentId = null
    entry.session = undefined
  }
  void replica?.dispose().catch(() => {})
})
/** Dynamic codegen waits until this isolated cell acknowledged its current props. */
async function getSource() {
  await propsReady
  if (!replica || closing) throw new Error('Preview unavailable')
  const source = await replica.source.get({ storyId: props.storyId, variantId: props.variantId, mode: 'dynamic' })
  return source.body
}
defineExpose({ retry: start, getSource })
</script>

<template>
  <div ref="container" class="histoire-canvas-replica" />
</template>

<style scoped>
.histoire-canvas-replica { width: 100%; height: 100%; }
</style>
