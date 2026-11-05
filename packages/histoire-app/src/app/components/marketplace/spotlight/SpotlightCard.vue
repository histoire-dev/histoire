<script setup lang="ts">
import type { AnchoredSpotlightTarget } from './use-spotlight-targets.js'
import { HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { computed, nextTick, onMounted, onScopeDispose, ref, useId, watch } from 'vue'
import { positionPopover } from '../../base/popover/position.js'

/** One contribution at a time, or a compact installed fallback without an anchor. */
const props = defineProps<{
  /** Current actual registration and DOM control. */ target?: AnchoredSpotlightTarget
  /** Plugin display name for the unanchored fallback. */ name: string
  /** One-based page number. */ page: number
  /** Anchored contribution count. */ total: number
  /** Command is in flight. */ running: boolean
  /** Recoverable inline command failure. */ error?: string
}>()
const emit = defineEmits<{
  /** Acknowledge this job. */ dismiss: []
  /** Advance to next live control. */ next: []
  /** Open plugin management. */ settings: []
  /** Run the current explicit command. */ run: []
}>()
const id = `histoire-marketplace-spotlight-${useId()}`
const panel = ref<HTMLElement>()
const position = ref<Record<string, string>>()
const ring = ref<Record<string, string>>()
const title = computed(() => props.target?.title ?? `${props.name} installed`)
/** Reuse viewport-clamped popover geometry after layout, scrolling and resizing. */
function reposition(): void {
  const anchor = props.target?.anchor.getBoundingClientRect()
  if (!anchor) {
    position.value = undefined
    ring.value = undefined
    return
  }
  const { innerWidth: width, innerHeight: height } = window
  const placed = positionPopover(anchor, { left: 0, top: 0, right: width, bottom: height }, { width, height }, 270, { height: panel.value?.getBoundingClientRect().height })
  position.value = Object.fromEntries(Object.entries(placed).map(([key, value]) => [key, `${value}px`]))
  ring.value = { left: `${anchor.left - 3}px`, top: `${anchor.top - 3}px`, width: `${anchor.width + 6}px`, height: `${anchor.height + 6}px` }
}
watch(() => props.target?.anchor, (anchor, _, cleanup) => {
  if (anchor) {
    const previous = anchor.getAttribute('aria-details')
    anchor.setAttribute('aria-details', id)
    cleanup(() => {
      if (anchor.getAttribute('aria-details') !== id) return
      if (previous === null) anchor.removeAttribute('aria-details')
      else anchor.setAttribute('aria-details', previous)
    })
  }
  void nextTick(() => {
    reposition()
    if (panel.value && !panel.value.contains(document.activeElement)) panel.value.focus()
  })
}, { immediate: true, flush: 'post' })
onMounted(() => {
  panel.value?.focus()
  reposition()
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
})
onScopeDispose(() => {
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})
</script>

<template>
  <div v-if="ring" aria-hidden="true" class="htw:fixed htw:z-[100] htw:pointer-events-none htw:rounded-md htw:bg-accent-soft" :style="ring" />
  <section :id="id" ref="panel" role="dialog" aria-label="Plugin added" :aria-describedby="`${id}-title`" tabindex="-1" class="htw:fixed htw:z-[101] htw:box-border htw:grid htw:gap-2 htw:rounded-xl htw:bg-text htw:p-3.5 htw:text-surface htw:text-[13px] htw:shadow-panel htw:outline-none" :class="target ? '' : 'htw:bottom-6 htw:end-6 htw:w-[270px] htw:max-w-[calc(100vw-32px)]'" :style="position">
    <h2 :id="`${id}-title`" class="htw:m-0 htw:font-extrabold htw:text-[14px]">
      {{ title }}
    </h2>
    <p v-if="target?.description" class="htw:m-0 htw:opacity-80">
      {{ target.description }}
    </p>
    <p v-if="error" role="alert" class="htw:m-0 htw:rounded-lg htw:bg-danger-soft htw:p-2 htw:text-danger-text">
      {{ error }}
    </p>
    <div class="htw:flex htw:items-center htw:flex-wrap htw:gap-1.5 htw:mt-1">
      <HstButton v-if="target?.command" color="primary" :disabled="running" @click="emit('run')">
        <HstPulsatingDisc v-if="running" :size="12" />{{ target.command.label }}
      </HstButton>
      <HstButton v-if="!target" color="primary" @click="emit('settings')">
        Open settings
      </HstButton>
      <HstButton v-if="page < total" color="flat" class="htw:text-inherit" @click="emit('next')">
        Next
      </HstButton>
      <HstButton color="flat" class="htw:text-inherit htw:opacity-80" @click="emit('dismiss')">
        Got it
      </HstButton>
      <span v-if="total" role="status" aria-live="polite" class="htw:ms-auto htw:font-mono htw:text-[11px] htw:opacity-60">{{ page }} / {{ total }}</span>
    </div>
  </section>
</template>
