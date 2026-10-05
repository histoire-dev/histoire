<script setup lang="ts">
import type { HistoireBuildInfo } from '@histoire/shared'
import { computed } from 'vue'

const props = defineProps<{
  /** Project theme title. */
  title: string
  /** Optional project description. */
  description?: string
  /** Real project release/build metadata. */
  buildInfo?: HistoireBuildInfo
}>()
const buildLine = computed(() => [props.buildInfo?.version && `v${props.buildInfo.version}`, props.buildInfo?.branch, props.buildInfo?.commit?.slice(0, 7)].filter(Boolean).join(' · '))
</script>

<template>
  <header class="histoire-home-header">
    <h1>{{ title }}</h1>
    <p v-if="description" class="histoire-home-description">
      {{ description }}
    </p>
    <p v-if="buildInfo" class="histoire-home-version">
      <template v-if="buildLine">
        {{ buildLine }} ·
      </template><time :datetime="buildInfo.builtAt">{{ new Date(buildInfo.builtAt).toLocaleDateString() }}</time>
    </p>
  </header>
</template>

<style scoped>
.histoire-home-header h1 { margin: 0; font-size: clamp(28px, 4vw, 36px); font-weight: 800; letter-spacing: -.02em; }
.histoire-home-version, .histoire-home-header time { color: var(--histoire-muted); font-family: var(--histoire-font-mono, monospace); font-size: 11px; }
.histoire-home-version { margin: 12px 0 0; }
.histoire-home-description { margin: 12px 0 8px; color: var(--histoire-body, var(--histoire-text)); font-size: 15px; }
.histoire-home-header time { display: inline; }
</style>
