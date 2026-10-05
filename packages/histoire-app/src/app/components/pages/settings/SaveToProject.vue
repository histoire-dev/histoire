<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useProjectConfigStore } from '../../../stores/project-config.js'
import { createConfigSnippet, previewConfigValueDiff } from './project-config-preview.js'
import ProjectSourceBadge from './ProjectSourceBadge.vue'

const props = defineProps<{ path: string, value: unknown, projectValue?: unknown, local?: boolean }>()
const emit = defineEmits<{ reset: [], saved: [] }>()
const project = useProjectConfigStore()
const confirm = ref(false)
const copied = ref(false)
const status = computed(() => project?.state.value.paths[props.path])
const editable = computed(() => ['absent', 'editable'].includes(status.value?.status ?? ''))
const snippet = computed(() => createConfigSnippet(props.path, props.value))
const diff = computed(() => previewConfigValueDiff(props.path, props.projectValue, props.value))
/** Exact confirmed value survives replacement; later user edits keep their override. */
function consumeSaved(): void {
  confirm.value = false
  if (project?.consumeSaved(props.path, props.value)) emit('saved')
}
onBeforeUnmount(project?.onSaved(consumeSaved) ?? (() => {}))
watch(() => props.path, (path) => {
  consumeSaved()
  project?.read([path])
}, { immediate: true })
/** Clipboard failure remains visible and does not discard the manual snippet. */
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(snippet.value)
    copied.value = true
  }
  catch { copied.value = false }
}
/** Only explicit confirmation admits a filesystem write. */
function save(): void {
  project?.save([{
    path: props.path,
    value: props.value,
  }])
}
</script>

<template>
  <div v-if="project?.available" class="histoire-settings-project">
    <ProjectSourceBadge :path="path" :local="local" />
    <HstButton color="default" class="histoire-settings-action" type="button" :disabled="!local || !editable || project.pending.value" @click="confirm = !confirm">
      Save to project
    </HstButton>
    <HstButton color="default" class="histoire-settings-action" type="button" :disabled="!local" @click="emit('reset')">
      Reset to project
    </HstButton>
    <template v-if="!editable && status">
      <span class="histoire-settings-muted">{{ status.reason }}</span>
      <HstButton color="default" class="histoire-settings-action" type="button" @click="copy">
        {{ copied ? 'Copied' : 'Copy snippet' }}
      </HstButton>
      <pre class="histoire-settings-diff">{{ snippet }}</pre>
    </template>
    <template v-if="confirm">
      <pre class="histoire-settings-diff" aria-label="Project settings diff">{{ diff }}</pre>
      <HstButton color="default" class="histoire-settings-action" type="button" :disabled="project.pending.value" @click="save">
        Confirm save
      </HstButton>
      <HstButton color="default" class="histoire-settings-action" type="button" @click="confirm = false">
        Cancel
      </HstButton>
    </template>
    <span v-if="project.state.value.error" role="alert">{{ project.state.value.error }}</span>
  </div>
</template>
