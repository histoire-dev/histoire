<script setup lang="ts">
import { HstButtonGroup } from '@histoire/controls/vue'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { computed, defineAsyncComponent, ref } from 'vue'
import { useUiSettingsStore } from '../../../stores/settings.js'
import { histoireConfig } from '../../../util/config.js'
import BackgroundsSection from './BackgroundsSection.vue'
import ViewportsSection from './ViewportsSection.vue'

const SaveToProject = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('./SaveToProject.vue')) : undefined
const session = useHistoireSession()
const snapshot = useHistoireSnapshot()
const settings = useUiSettingsStore()!
const error = ref('')
const scheme = computed(() => snapshot.value.settings.colorScheme)
/** Runtime settings remain canonical, including system mode and existing persistence keys. */
async function setScheme(value: 'auto' | 'light' | 'dark'): Promise<void> {
  try {
    await session.settings.update({
      colorScheme: value,
    })
    error.value = ''
  }
  catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
}
/** Saved project default supersedes the browser override after runtime restarts. */
function clearColorPreference(): void {
  try {
    const storage = histoireConfig.theme.storeColorScheme ? localStorage : sessionStorage
    storage.removeItem('histoire-color-scheme')
  }
  catch { /* Blocked storage does not undo an acknowledged project save. */ }
}
</script>

<template>
  <section>
    <h1>Appearance</h1>
    <div class="histoire-settings-card">
      <div v-if="!histoireConfig.theme.hideColorSchemeSwitch" class="histoire-settings-row">
        <strong>Color scheme</strong>
        <HstButtonGroup layout="inline" aria-label="Color scheme" :model-value="scheme" :options="[{ value: 'auto', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]" @update:model-value="setScheme" />
      </div>
      <SaveToProject v-if="SaveToProject && !histoireConfig.theme.hideColorSchemeSwitch" path="theme.defaultColorScheme" :value="scheme" :project-value="histoireConfig.theme.defaultColorScheme" :local="scheme !== histoireConfig.theme.defaultColorScheme" @reset="setScheme(histoireConfig.theme.defaultColorScheme ?? 'auto')" @saved="clearColorPreference" />
      <div class="histoire-settings-row">
        <strong>Density</strong>
        <HstButtonGroup layout="inline" aria-label="Density" :model-value="settings.state.density" :options="[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]" @update:model-value="settings.update({ density: $event })" />
      </div>
      <p v-if="error" role="alert">
        {{ error }}
      </p>
    </div>
    <ViewportsSection embedded />
    <BackgroundsSection />
  </section>
</template>
