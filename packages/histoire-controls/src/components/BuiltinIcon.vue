<script setup lang="ts">
import { getHistoireIcon } from '@histoire/shared/dist/icons/index.js'
import { computed } from 'vue'

const props = defineProps<{
  /** Fixed first-party glyph; user components retain their own icon integrations. */
  icon: string
}>()
const glyph = computed(() => getHistoireIcon(props.icon))
</script>

<template>
  <svg
    class="iconify iconify--carbon"
    width="1em"
    height="1em"
    :viewBox="`0 0 ${glyph?.width ?? 32} ${glyph?.height ?? 32}`"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    v-html="glyph?.body ?? ''"
  />
</template>
