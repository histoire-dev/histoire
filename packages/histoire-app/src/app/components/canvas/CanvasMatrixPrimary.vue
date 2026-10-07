<script setup lang="ts">
import type { HistoireMount } from '@histoire/sdk'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCanvasFrameState } from '../../composables/canvas-settings.js'
import CanvasReplicaPreview from './CanvasReplicaPreview.vue'
import { getCanvasTargetGeneration } from './frame-source.js'
import { createCanvasStartupReadiness, observeCanvasStartupRuntime, waitForCanvasStartup } from './frame-startup-lifecycle.js'

const props = defineProps<{
  /** Discovery runtime exists only while requested arrangement is Matrix. */
  active: boolean
  /** Source URL used by the first-variant passive runtime in story chooser. */
  previewBase: string
  /** Logical dimensions remain measurable despite hidden canonical surface. */
  width: number
  /** Logical height matches visible Matrix cells. */
  height: number
}>()
const emit = defineEmits<{ error: [error: unknown], status: [status: 'loading' | 'ready' | 'error'] }>()
const session = useHistoireSession()
const snapshot = useHistoireSnapshot()
const state = useCanvasFrameState()
const container = ref<HTMLElement>()
const story = computed(() => snapshot.value.catalog.stories.find(item => item.id === snapshot.value.selection?.storyId))
const selected = computed(() => snapshot.value.selection?.variantId != null)
const target = computed(() => {
  const variantId = snapshot.value.selection?.variantId ?? story.value?.variants[0]?.id
  return story.value && variantId ? { storyId: story.value.id, variantId } : undefined
})
const sourceKey = computed(() => {
  const value = target.value
  const generation = value && getCanvasTargetGeneration(snapshot.value, value)
  return props.active && generation ? JSON.stringify([generation, value, selected.value]) : ''
})
let closed = false
/** Capture exact passive lifetime before Vue replaces its source or target. */
const passiveStatus = computed(() => {
  const key = sourceKey.value
  return (status: 'loading' | 'ready' | 'error', error?: unknown): void => {
    if (closed || !key || key !== sourceKey.value) return
    emit('status', status)
    if (error) emit('error', error)
  }
})
let mount: HistoireMount | undefined
let mountedKey = ''
let stop = () => {}
let controller: AbortController | undefined
let generation = 0
let releasing = Promise.resolve()

/** Retire state observers before SDK asynchronously releases primary ownership. */
function release(): void {
  stop()
  stop = () => {}
  controller?.abort()
  controller = undefined
  const previous = mount
  const previousKey = mountedKey
  mount = undefined
  mountedKey = ''
  if (previous) {
    const token = generation
    releasing = Promise.all([releasing, previous.unmount()]).then(() => {}).catch((error) => {
      if (!closed && token === generation && previousKey === sourceKey.value && props.active) emit('error', error)
    })
  }
}

/** Rapid arrangement switches join prior release before acquiring canonical primary again. */
async function synchronize(): Promise<void> {
  const token = ++generation
  const key = sourceKey.value
  const expected = target.value
  emit('status', 'loading')
  release()
  await releasing
  if (closed || token !== generation || !key || key !== sourceKey.value || !selected.value || !container.value || !expected) return
  const host = container.value
  const abort = new AbortController()
  controller = abort
  const readiness = createCanvasStartupReadiness(abort.signal)
  let ready = false
  let failed = false
  /** Async restoration and errors cannot publish for a replaced story document. */
  function isCurrent(): boolean {
    return !closed && token === generation && key === sourceKey.value && container.value === host
  }
  /** Failed discovery must settle loading even when failure detail is absent. */
  function fail(error?: unknown): void {
    readiness.fail(error)
    if (isCurrent() && !failed) {
      failed = true
      emit('status', 'error')
      if (error) emit('error', error)
    }
  }
  try {
    stop = observeCanvasStartupRuntime({
      owner: session,
      canonical: session,
      state,
      target: () => expected,
      document: () => host.querySelector('iframe')?.contentDocument,
      isCurrent,
      isStartupPending: () => !ready,
      loading() {
        ready = failed = false
        emit('status', 'loading')
      },
      error: fail,
      startupFailure: fail,
      ready() {
        ready = true
        failed = false
        readiness.ready()
        emit('status', 'ready')
      },
    })
    mount = session.mount(host, { surface: 'preview' })
    mountedKey = key
    await waitForCanvasStartup(Promise.all([mount.ready, readiness.promise]), abort.signal)
  }
  catch (error) {
    if (isCurrent() && !abort.signal.aborted) fail(error)
  }
  finally {
    readiness.dispose()
  }
}

watch([sourceKey, container], () => void synchronize(), { flush: 'post', immediate: true })
onBeforeUnmount(() => {
  closed = true
  generation++
  release()
})
</script>

<template>
  <div class="histoire-matrix-primary" :style="{ width: `${width}px`, height: `${height}px` }" aria-hidden="true" inert>
    <div v-if="selected" ref="container" class="histoire-matrix-primary-host" />
    <!-- One ordinary passive runtime discovers the first variant without changing chooser selection. -->
    <CanvasReplicaPreview v-else-if="sourceKey && target" :key="sourceKey" :frame-id="`matrix-discovery:${sourceKey}`" :story-id="target.storyId" :variant-id="target.variantId" :preview-base="previewBase" :viewport="{ width, height }" @status="passiveStatus" />
  </div>
</template>

<style scoped>
.histoire-matrix-primary { position: absolute; visibility: hidden; pointer-events: none; overflow: hidden; }
.histoire-matrix-primary-host { width: 100%; height: 100%; }
</style>
