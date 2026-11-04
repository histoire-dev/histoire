<script setup lang="ts">
import type { ResolvedEmbedDesign } from '../types.js'
import { WorkbenchLoadingState } from '@histoire/plugin-kit/vue'
import { computed, ref, watch } from 'vue'
import { iframeAttributes } from '../designs/iframe-attrs.js'

const props = defineProps<{
  /** Embedded design to show. */
  design: ResolvedEmbedDesign
}>()

/** The current iframe document finished loading; hides the loading overlay. */
const loaded = ref(false)
watch(() => props.design.src, () => {
  loaded.value = false
})
/** Sandbox, permissions and source of the iframe. */
const attributes = computed(() => iframeAttributes(props.design))
</script>

<template>
  <div class="histoire-designs-embed">
    <!-- Keyed so switching designs starts a fresh document instead of navigating the old one. -->
    <iframe :key="design.src" v-bind="attributes" @load="loaded = true" />
    <WorkbenchLoadingState v-if="!loaded" class="histoire-designs-overlay" :title="`Loading ${design.name}`" />
  </div>
</template>
