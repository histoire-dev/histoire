<script setup lang="ts">
import type { BackgroundPreset } from '@histoire/shared'
import type { PresetOwner } from '../../../stores/presets-config.js'
import { HstButton, HstText } from '@histoire/controls/vue'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { defineAsyncComponent, ref } from 'vue'
import { usePresetConfigStore } from '../../../stores/presets-config.js'
import { histoireConfig } from '../../../util/config.js'
import { backgroundPatch } from '../../canvas/toolbar/settings.js'

const SaveToProject = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('./SaveToProject.vue')) : undefined
const session = useHistoireSession()
const snapshot = useHistoireSnapshot()
const presets = usePresetConfigStore()!
const editing = ref<PresetOwner | 'new' | null>(null)
const draft = ref<BackgroundPreset>({ label: '', color: '#ffffff' })
const error = ref('')
/** Clicking swatches updates canonical story background immediately. */
async function select(value: string): Promise<void> {
  try {
    const patch = backgroundPatch(value)
    if (!patch) throw new Error('Background color is not supported')
    await session.settings.update(patch)
    error.value = ''
  }
  catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
}
/** Editor retains source/local owner while other rows are removed or reordered. */
function edit(index: number | null): void {
  const owner = index === null ? 'new' : presets.backgroundOwner(index)
  if (!owner) return
  editing.value = owner
  draft.value = index === null
    ? {
        label: '',
        color: '#ffffff',
      }
    : {
        ...presets.backgroundPresets.value[index],
      }
  error.value = ''
}
/** Persist only validated color data and labels. */
function save(): void {
  try {
    if (editing.value === 'new') presets.addBackground(draft.value)
    else if (editing.value) presets.updateBackground(editing.value, draft.value)
    editing.value = null
  }
  catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
}
</script>

<template>
  <div class="histoire-settings-card">
    <header>
      <strong>Story backgrounds</strong><HstButton color="default" class="histoire-settings-action" type="button" @click="edit(null)">
        + Add background
      </HstButton>
    </header>
    <div class="histoire-background-presets">
      <div v-for="(preset, index) in presets.backgroundPresets.value" :key="presets.backgroundKey(index)" class="histoire-background-preset">
        <HstButton color="flat" type="button" :class="{ checker: preset.color === '$checkerboard' || preset.color === 'transparent' }" :style="{ backgroundColor: preset.color === '$checkerboard' ? undefined : preset.color, color: preset.contrastColor }" :aria-label="`Select ${preset.label} background`" :aria-pressed="preset.color === '$checkerboard' ? snapshot.settings.checkerboard : snapshot.settings.backgroundColor === preset.color" @click="select(preset.color)">
          Aa
        </HstButton>
        <span>{{ preset.label }}</span><div class="histoire-background-actions">
          <HstButton color="flat" type="button" :aria-label="`Edit ${preset.label} background`" @click="edit(index)">
            Edit
          </HstButton><HstButton color="flat" type="button" :aria-label="`Remove ${preset.label} background`" @click="presets.removeBackground(index)">
            Remove
          </HstButton>
        </div>
      </div>
    </div>
    <form v-if="editing !== null" class="histoire-settings-row" @submit.prevent="save">
      <HstText v-model="draft.label" layout="inline" class="histoire-settings-field" aria-label="Background name" placeholder="Name" required />
      <HstText v-model="draft.color" layout="inline" class="histoire-settings-field" aria-label="Background color" placeholder="#ffffff" required />
      <HstText v-model="draft.contrastColor" layout="inline" class="histoire-settings-field" aria-label="Text contrast color" placeholder="Text color" />
      <HstButton color="default" class="histoire-settings-action" type="submit">
        Save
      </HstButton><HstButton color="default" class="histoire-settings-action" type="button" @click="editing = null">
        Cancel
      </HstButton>
    </form>
    <SaveToProject v-if="SaveToProject" path="backgroundPresets" :value="presets.backgroundPresets.value" :project-value="histoireConfig.backgroundPresets" :local="presets.backgroundsOverridden.value" @reset="presets.resetBackgrounds" @saved="presets.resetBackgrounds" />
    <div v-else-if="presets.backgroundsOverridden.value" class="histoire-settings-project">
      <HstButton color="default" class="histoire-settings-action" type="button" @click="presets.resetBackgrounds">
        Reset to project
      </HstButton>
    </div>
    <span v-if="error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.histoire-background-presets { display: flex; flex-wrap: wrap; gap: 10px; padding: 20px; }
.histoire-background-preset { width: 100px; display: flex; flex-direction: column; text-align: center; gap: 6px; font-size: 12px; }
.histoire-background-preset > button { width: 100%; height: 60px; font-weight: 600; }
.histoire-background-preset > button[aria-pressed=true] { outline: 2px solid var(--histoire-accent, #10b981); outline-offset: 2px; }
.histoire-background-preset > .checker { background-image: conic-gradient(#d4d4d8 25%, white 0 50%, #d4d4d8 0 75%, white 0); background-size: 14px 14px; }
.histoire-background-actions { display: flex; justify-content: center; gap: 8px; }
.histoire-background-actions button { color: var(--histoire-muted, #71717a); }
</style>
