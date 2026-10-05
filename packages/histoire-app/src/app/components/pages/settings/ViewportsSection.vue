<script setup lang="ts">
import type { ResponsivePreset } from '@histoire/shared'
import type { PresetOwner } from '../../../stores/presets-config.js'
import { HstButton, HstNumber, HstText } from '@histoire/controls/vue'
import { defineAsyncComponent, ref } from 'vue'
import { usePresetConfigStore } from '../../../stores/presets-config.js'
import { histoireConfig } from '../../../util/config.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const props = defineProps<{ embedded?: boolean }>()
const SaveToProject = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('./SaveToProject.vue')) : undefined
const presets = usePresetConfigStore()!
const editing = ref<PresetOwner | 'new' | null>(null)
const draft = ref<Omit<ResponsivePreset, 'height'> & { height?: number | null | '' }>({ label: '', width: 1024, height: 640 })
const error = ref('')
/** Existing row identity survives collection removals and HMR reordering. */
function edit(index: number | null): void {
  const owner = index === null ? 'new' : presets.viewportOwner(index)
  if (!owner) return
  editing.value = owner
  draft.value = index === null ? { label: '', width: 1024, height: 640 } : { ...presets.responsivePresets.value[index] }
  error.value = ''
}
/** Validation remains in shared preset owner so toolbar never sees invalid dimensions. */
function save(): void {
  try {
    const value: ResponsivePreset = { ...draft.value, height: draft.value.height === '' || draft.value.height == null ? null : draft.value.height }
    if (editing.value === 'new') presets.addViewport(value)
    else if (editing.value) presets.updateViewport(editing.value, value)
    editing.value = null
  }
  catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
}
</script>

<template>
  <section :class="{ 'histoire-settings-embedded': props.embedded }">
    <h1 v-if="!embedded">
      Viewports
    </h1>
    <div class="histoire-settings-card">
      <header>
        <strong>Viewport presets</strong><HstButton color="default" class="histoire-settings-action" type="button" @click="edit(null)">
          + Add preset
        </HstButton>
      </header>
      <div v-for="(preset, index) in presets.responsivePresets.value" :key="presets.viewportKey(index)" class="histoire-settings-row histoire-viewport-row">
        <WorkbenchIcon :name="preset.width < 600 ? 'mobile' : preset.width < 1000 ? 'tablet' : preset.width < 1280 ? 'laptop' : 'screen'" :size="17" /><strong>{{ preset.label }}</strong><code>{{ preset.width }} × {{ preset.height ?? 'Auto' }}</code>
        <HstButton color="default" class="histoire-settings-action" type="button" :aria-label="`Edit ${preset.label}`" @click="edit(index)">
          <WorkbenchIcon name="edit" :size="15" />
        </HstButton>
        <HstButton color="default" class="histoire-settings-action" type="button" :aria-label="`Remove ${preset.label}`" @click="presets.removeViewport(index)">
          <WorkbenchIcon name="trash-can" :size="15" />
        </HstButton>
      </div>
      <form v-if="editing !== null" class="histoire-settings-row" @submit.prevent="save">
        <HstText v-model="draft.label" layout="inline" class="histoire-settings-field" aria-label="Preset name" placeholder="Name" required />
        <HstNumber v-model="draft.width" layout="inline" class="histoire-settings-field" aria-label="Viewport width" min="1" required style="width: 90px" />
        <HstNumber layout="inline" :model-value="typeof draft.height === 'number' ? draft.height : null" class="histoire-settings-field" aria-label="Viewport height" min="1" placeholder="Auto" style="width: 90px" @update:model-value="draft.height = $event" />
        <HstButton color="default" class="histoire-settings-action" type="submit">
          Save
        </HstButton><HstButton color="default" class="histoire-settings-action" type="button" @click="editing = null">
          Cancel
        </HstButton>
        <span v-if="error" role="alert">{{ error }}</span>
      </form>
      <SaveToProject v-if="SaveToProject" path="responsivePresets" :value="presets.responsivePresets.value" :project-value="histoireConfig.responsivePresets" :local="presets.viewportsOverridden.value" @reset="presets.resetViewports" @saved="presets.resetViewports" />
      <div v-else-if="presets.viewportsOverridden.value" class="histoire-settings-project">
        <HstButton color="default" class="histoire-settings-action" type="button" @click="presets.resetViewports">
          Reset to project
        </HstButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.histoire-viewport-row { padding-block: var(--histoire-viewport-row-padding, 13px); }
.histoire-viewport-row > strong { flex: 1; }
.histoire-viewport-row > .histoire-settings-action { border: 0; background: transparent; color: var(--histoire-muted, #71717a); padding: 4px; }
.histoire-viewport-row code { width: 125px; color: var(--histoire-muted, #71717a); font-size: 12px; }
</style>
