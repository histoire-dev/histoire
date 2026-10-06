<script setup lang="ts">
import type { HistoireSession } from '@histoire/sdk'
import { PROPS_OVERRIDE, RUNTIME_RESULT } from '@histoire/shared'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { useEventListener } from '@vueuse/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasFrameState, useCanvasStore } from '../../composables/canvas-settings.js'
import { useMatrixStore } from '../../stores/matrix.js'
import { createCanvasReplicaSession } from './frame-replica.js'
import { createCanvasPropsRequestId } from './frame-requests.js'
import { observeCanvasFrameRuntime } from './frame-runtime.js'

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
const ready = ref(false)
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

/** Canonical settings apply to every exact frame without sharing editable variant state. */
function settings() {
  const value = snapshot.value.settings
  const background = store.frameBackgrounds[props.frameId]
  return { ...value, ...(background ?? {}) }
}

/** Publish actual iframe identity for finite measure/comment requests. */
function registerDocument(available = false) {
  const entry = registry.getFrame(props.frameId)
  const iframe = container.value?.querySelector('iframe')
  if (!entry || !iframe) return
  iframe.setAttribute('data-test-id', 'preview-iframe-passive')
  entry.iframe = iframe
  entry.documentId = available ? new URL(iframe.src).searchParams.get('documentId') : null
  entry.session = available ? replica : undefined
}

/** Keep unavailable pixels registered for geometry without granting runtime authority. */
function loading(): void {
  ready.value = false
  registerDocument()
  emit('status', 'loading')
}

/** Failed frame keeps retry local and releases inspector/document authority. */
function fail(error?: unknown): void {
  ready.value = false
  registerDocument()
  emit('status', 'error', error)
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
    fail(error)
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
    fail(error)
  }, 3000)
}

/** Each retry closes previous source/session before acquiring another document. */
async function start() {
  const version = ++generation
  loading()
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
    stop = observeCanvasFrameRuntime(current, {
      state: props.propsOverride ? undefined : frameState,
      loading,
      error: fail,
      ready(value) {
        if (closing || version !== generation) return
        observer?.capture(value)
        registerDocument(true)
        if (value.runtime.runtimeId && value.runtime.runtimeId !== overrideDocument) {
          overrideDocument = value.runtime.runtimeId
          overrideProps()
        }
        ready.value = true
        emit('status', 'ready')
      },
    })
    const mount = current.mount(container.value, { surface: 'preview' })
    await mount.ready
  }
  catch (error) {
    if (!closing && version === generation) fail(error)
  }
}

watch(settings, () => {
  void replica?.settings.update(settings()).catch(() => {})
}, { deep: true })
watch(() => props.propsOverride, overrideProps, { deep: true })
useEventListener('message', receive)
onMounted(() => void start())
onBeforeUnmount(() => {
  closing = true
  generation++
  stop()
  closeObserver()
  clearTimeout(propsTimeout)
  rejectProps(new Error('Preview detached'))
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
  <div ref="container" class="histoire-canvas-replica" :aria-busy="!ready" :inert="!ready ? true : undefined" />
</template>

<style scoped>
.histoire-canvas-replica { width: 100%; height: 100%; }
</style>
