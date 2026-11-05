<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  /** Bounded sanitized lines supplied by server. */ output: string[]
}>()
const log = ref<HTMLElement>()
let follow = true
/** Keep user's scroll position when reading earlier output. */
function scroll(): void {
  const element = log.value
  if (element) follow = element.scrollHeight - element.scrollTop - element.clientHeight < 24
}
watch(() => props.output, async () => {
  await nextTick()
  if (follow && log.value) log.value.scrollTop = log.value.scrollHeight
}, { immediate: true, deep: true })
</script>

<template>
  <pre ref="log" tabindex="0" aria-label="Install output" class="htw:m-0 htw:font-mono htw:leading-[1.7] htw:text-body htw:max-h-64 htw:overflow-auto htw:rounded-xl htw:bg-canvas htw:p-4 htw:text-xs" @scroll="scroll"><code>{{ output.join('\n') }}</code></pre>
</template>
