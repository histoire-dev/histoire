<script setup lang="ts">
import type { HistoireMount } from '@histoire/sdk'
import { useHistoireSession } from '@histoire/vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useCanvasFrameState } from '../../composables/canvas-settings.js'
import { observeCanvasFrameRuntime } from './frame-runtime.js'

const props = defineProps<{
  /** Canonical runtime exists only while actual arrangement is Matrix. */
  active: boolean
  /** Logical dimensions remain measurable despite hidden canonical surface. */
  width: number
  /** Logical height matches visible Matrix cells. */
  height: number
}>()
const emit = defineEmits<{ error: [error: unknown] }>()
const session = useHistoireSession()
const state = useCanvasFrameState()
const container = ref<HTMLElement>()
let mount: HistoireMount | undefined
let stop = () => {}
let generation = 0
let releasing = Promise.resolve()
let closed = false

/** Retire state observers before SDK asynchronously releases primary ownership. */
function release(): void {
  stop()
  stop = () => {}
  const previous = mount
  mount = undefined
  if (previous) {
    releasing = Promise.all([releasing, previous.unmount()]).then(() => {}).catch((error) => {
      if (!closed) emit('error', error)
    })
  }
}

/** Rapid arrangement switches join prior release before acquiring canonical primary again. */
async function synchronize(): Promise<void> {
  const token = ++generation
  release()
  await releasing
  if (closed || token !== generation || !props.active || !container.value) return
  try {
    stop = observeCanvasFrameRuntime(session, { state, loading: () => {}, ready: () => {}, error: error => error && emit('error', error) })
    mount = session.mount(container.value, { surface: 'preview' })
    await mount.ready
  }
  catch (error) {
    if (!closed && token === generation) emit('error', error)
  }
}

watch([() => props.active, container], () => void synchronize(), { flush: 'post' })
onBeforeUnmount(() => {
  closed = true
  generation++
  release()
})
</script>

<template>
  <div ref="container" class="histoire-matrix-primary" :style="{ width: `${width}px`, height: `${height}px` }" aria-hidden="true" inert />
</template>

<style scoped>
.histoire-matrix-primary { position: absolute; visibility: hidden; pointer-events: none; overflow: hidden; }
</style>
