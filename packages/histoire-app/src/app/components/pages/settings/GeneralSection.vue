<script setup lang="ts">
import { HstButton, HstButtonGroup, HstSwitch } from '@histoire/controls/vue'
import { defineAsyncComponent } from 'vue'
import { useUiSettingsStore } from '../../../stores/settings.js'
import { histoireConfig } from '../../../util/config.js'

const SaveToProject = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('./SaveToProject.vue')) : undefined
const settings = useUiSettingsStore()!
</script>

<template>
  <section>
    <h1>General</h1><div class="histoire-settings-card">
      <div class="histoire-settings-row">
        <strong>Default arrangement</strong><HstButtonGroup layout="inline" aria-label="Default arrangement" :model-value="settings.defaultArrange.value ?? histoireConfig.ui?.defaultArrange ?? 'grid'" :options="[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]" @update:model-value="settings.setArrange($event)" />
      </div>
      <SaveToProject v-if="SaveToProject" path="ui.defaultArrange" :value="settings.defaultArrange.value ?? histoireConfig.ui?.defaultArrange ?? 'grid'" :project-value="histoireConfig.ui?.defaultArrange" :local="settings.defaultArrange.value !== undefined" @reset="settings.setArrange(undefined)" @saved="settings.setArrange(undefined)" />
      <div class="histoire-settings-row">
        <label for="histoire-sync-zoom">Sync zoom across stories</label><HstSwitch id="histoire-sync-zoom" layout="inline" :model-value="settings.state.syncZoom" @update:model-value="settings.update({ syncZoom: $event })" />
      </div>
      <div class="histoire-settings-row">
        <strong>Local preferences</strong><HstButton color="default" type="button" class="histoire-settings-action" @click="settings.reset">
          Reset preferences
        </HstButton>
      </div>
    </div>
  </section>
</template>
