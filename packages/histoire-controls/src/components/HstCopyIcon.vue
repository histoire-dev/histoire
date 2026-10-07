<script lang="ts">
export default {
  name: 'HstCopyIcon',
}
</script>

<script lang="ts" setup>
import type { Awaitable } from '@histoire/shared'
import type { HstControlHandle } from '../types'
import { onBeforeUnmount, ref } from 'vue'
import { VTooltip as vTooltip } from '../overlay/tooltip'
import BuiltinIcon from './BuiltinIcon.vue'
import HstButton from './button/HstButton.vue'

const props = defineProps<{
  /** Text or asynchronous text producer copied by this action. */
  content: string | (() => Awaitable<string>)
  /** Action-specific accessible name; defaults to Copy. */
  label?: string
}>()

const copied = ref(false)
const button = ref<HstControlHandle>()
let active = true
let copiedTimer: ReturnType<typeof setTimeout> | undefined

/** Releases the per-button feedback timer and blocks retired async work. */
onBeforeUnmount(() => {
  active = false
  clearTimeout(copiedTimer)
  copiedTimer = undefined
})

/** Focus shared button without triggering clipboard writes. */
function focus(): void {
  button.value?.focus()
}
defineExpose({ focus })

/** Copies through the native API and retains VueUse's legacy rejection fallback. */
async function copy(content: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('clipboard' in navigator)) return

  try {
    await navigator.clipboard.writeText(content)
  }
  catch {
    if (!active) return
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.style.position = 'absolute'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    try {
      textarea.select()
      document.execCommand('copy')
    }
    finally {
      textarea.remove()
    }
  }

  if (!active) return
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copiedTimer = undefined
    if (active) copied.value = false
  }, 1500)
}

/** Resolves current content before starting clipboard access. */
async function action(): Promise<void> {
  const content = typeof props.content === 'function' ? await props.content() : props.content
  if (!active) return
  await copy(content)
}
</script>

<template>
  <HstButton ref="button" icon-only color="flat" :aria-label="copied ? 'Copied' : label ?? 'Copy'" @click="action">
    <BuiltinIcon
      v-if="copied"
      v-tooltip="{
        content: 'Copied!',
        triggers: [],
        shown: copied,
        distance: 12,
        delay: 0,
      }"
      icon="carbon:copy-file"
      class="htw-w-4 htw-h-4 htw-opacity-50 hover:htw-opacity-100 htw-cursor-pointer"
    />
    <BuiltinIcon v-else icon="carbon:copy-file" class="htw-w-4 htw-h-4 htw-opacity-50 hover:htw-opacity-100 htw-cursor-pointer" />
  </HstButton>
</template>
