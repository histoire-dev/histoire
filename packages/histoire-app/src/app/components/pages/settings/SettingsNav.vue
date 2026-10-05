<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { SETTINGS_SECTIONS } from '../../../stores/settings.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const props = defineProps<{ section: string, dev: boolean }>()
const emit = defineEmits<{ section: [section: string] }>()
</script>

<template>
  <nav class="histoire-settings-nav" aria-label="Settings sections">
    <strong>Settings</strong>
    <HstButton v-for="item in SETTINGS_SECTIONS.filter(item => dev || !('devOnly' in item))" :key="item.id" color="flat" type="button" :aria-current="props.section === item.id ? 'page' : undefined" @click="emit('section', item.id)">
      <WorkbenchIcon class="histoire-settings-nav-icon" :name="{ general: 'settings', appearance: 'color-palette', viewports: 'laptop', tests: 'chemistry', agents: 'bot', mcp: 'plug', shortcuts: 'keyboard', about: 'information' }[item.id]" :size="18" />
      {{ item.label }}
    </HstButton>
    <footer>Saved to localStorage · project defaults from <code>histoire.config</code></footer>
  </nav>
</template>
