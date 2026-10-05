<script setup lang="ts">
import { HstSwitch } from '@histoire/controls/vue'
import { useUiSettingsStore } from '../../../stores/settings.js'

const settings = useUiSettingsStore()!
</script>

<template>
  <section>
    <h1>Tests</h1><div class="histoire-settings-card">
      <div class="histoire-settings-row">
        <label for="histoire-watch-tests">Watch tests</label><HstSwitch id="histoire-watch-tests" layout="inline" :model-value="settings.state.watchTests" @update:model-value="settings.update({ watchTests: $event })" />
      </div>
    </div>
  </section>
</template>
