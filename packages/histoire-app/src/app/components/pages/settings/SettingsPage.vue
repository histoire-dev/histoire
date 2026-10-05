<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue'
import { normalizeSettingsSection } from '../../../stores/settings.js'
import SettingsNav from './SettingsNav.vue'
import './settings.css'

const props = defineProps<{ section?: string, buildInfo?: { version?: string, commit?: string, branch?: string, builtAt?: string } }>()
const emit = defineEmits<{ section: [section: string] }>()
const dev = __HISTOIRE_DEV__
const section = computed(() => normalizeSettingsSection(props.section, dev))
const sections = {
  general: defineAsyncComponent(() => import('./GeneralSection.vue')),
  appearance: defineAsyncComponent(() => import('./AppearanceSection.vue')),
  viewports: defineAsyncComponent(() => import('./ViewportsSection.vue')),
  shortcuts: defineAsyncComponent(() => import('./ShortcutsSection.vue')),
  about: defineAsyncComponent(() => import('./AboutSection.vue')),
  ...(dev
    ? {
        tests: defineAsyncComponent(() => import('./TestsSection.vue')),
        mcp: defineAsyncComponent(() => import('./McpSection.vue')),
        agents: defineAsyncComponent(() => import('./AgentsSection.vue')),
      }
    : {}),
}
watch(section, (value) => {
  if (props.section !== value) emit('section', value)
}, {
  immediate: true,
})
</script>

<template>
  <div class="histoire-settings-page">
    <SettingsNav :section="section" :dev="dev" @section="emit('section', $event)" />
    <main class="histoire-settings-content">
      <component :is="sections[section]" :build-info="buildInfo" />
    </main>
  </div>
</template>
