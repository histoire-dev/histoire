<script setup lang="ts">
import { computed } from 'vue'
import { useProjectConfigStore } from '../../../stores/project-config.js'

const props = defineProps<{ path: string, local?: boolean }>()
const project = useProjectConfigStore()
const label = computed(() => {
  if (props.local) return 'local'
  const status = project?.state.value.paths[props.path]
  if (!status || status.status === 'absent') return 'default'
  if (status.status === 'computed' || status.status === 'function-only') return 'computed in code'
  const file = project?.state.value.file?.split('/').pop() ?? 'histoire.config'
  return `project (${file}${status.location ? `:${status.location.line}` : ''})`
})
</script>

<template>
  <span class="histoire-settings-muted">{{ label }}</span>
</template>
