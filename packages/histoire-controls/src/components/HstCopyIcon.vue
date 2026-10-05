<script lang="ts">
export default {
  name: 'HstCopyIcon',
}
</script>

<script lang="ts" setup>
import type { Awaitable } from '@histoire/shared'
import type { HstControlHandle } from '../types'
import { useClipboard } from '@vueuse/core'
import { ref } from 'vue'
import { VTooltip as vTooltip } from '../overlay/tooltip'
import BuiltinIcon from './BuiltinIcon.vue'
import HstButton from './button/HstButton.vue'

const props = defineProps<{
  /** Text or asynchronous text producer copied by this action. */
  content: string | (() => Awaitable<string>)
}>()

const { copy, copied } = useClipboard()
const button = ref<HstControlHandle>()

/** Focus shared button without triggering clipboard writes. */
function focus(): void {
  button.value?.focus()
}
defineExpose({ focus })

/** Resolve current content before writing to clipboard. */
async function action() {
  const content = typeof props.content === 'function' ? await props.content() : props.content
  copy(content)
}
</script>

<template>
  <HstButton ref="button" color="flat" :aria-label="copied ? 'Copied' : 'Copy'" @click="action">
    <BuiltinIcon
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
  </HstButton>
</template>
