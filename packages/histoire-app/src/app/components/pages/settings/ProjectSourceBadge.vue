<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useProjectConfigStore } from '../../../stores/project-config.js'

/** Current setting path and whether device preferences override its project value. */
const props = defineProps<{ path: string, local?: boolean }>()
/** Project analysis retains source location without exposing it as the main label. */
const project = useProjectConfigStore()
/** Readable source names pair with bundled, decorative Carbon icons. */
const source = computed(() => {
  if (props.local) return { label: 'Saved locally', icon: 'laptop' }
  const status = project?.state.value.paths[props.path]
  if (!status || status.status === 'absent') return { label: 'Default settings', icon: 'settings' }
  if (status.status === 'computed' || status.status === 'function-only') return { label: 'Defined in code', icon: 'code' }
  return { label: 'Project settings', icon: 'folder' }
})
/** File and line stay available on hover for project-owned settings. */
const location = computed(() => {
  const status = project?.state.value.paths[props.path]
  if (props.local || !status || status.status === 'absent') return undefined
  const file = project?.state.value.file?.split('/').pop() ?? 'histoire.config'
  return `${file}${status.location ? `, line ${status.location.line}` : ''}`
})
</script>

<template>
  <span class="histoire-settings-source" :title="location">
    <BuiltinIcon :icon="source.icon" :size="14" />
    <span>{{ source.label }}</span>
  </span>
</template>

<style scoped>
.histoire-settings-source {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  color: var(--histoire-muted, #71717a);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}
</style>
