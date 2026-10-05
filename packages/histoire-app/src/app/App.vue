<script setup lang="ts">
import type { WorkbenchProps } from './standalone/workbench-types.js'
import { HistoireProvider } from '@histoire/vue'
import { provideHistoireTestsModel } from '@histoire/vue/internal'
import WorkbenchApp from './components/shell/WorkbenchApp.vue'

const props = defineProps<WorkbenchProps>()
const emit = defineEmits<{ error: [error: unknown] }>()
provideHistoireTestsModel(props.tests)

/** Standalone roles override the SDK's generic inline palette; RGB channels remain theme-reactive. */
const workbenchTheme = {
  /** Canvas behind standalone surfaces. */
  '--histoire-background': 'var(--histoire-canvas)',
  /** Native panels inherit workbench text. */
  '--histoire-foreground': 'var(--histoire-text)',
  /** Preserve dark/custom muted channels over provider inline values. */
  '--histoire-muted': 'rgb(var(--histoire-muted-rgb) / var(--histoire-muted-alpha, 1))',
  /** Preserve workbench borders on native SDK content. */
  '--histoire-border': 'rgb(var(--histoire-border-rgb) / var(--histoire-border-alpha, 1))',
  /** Light uses primary 500; dark uses primary 400 through the authored channel mapping. */
  '--histoire-accent': 'rgb(var(--histoire-accent-rgb) / var(--histoire-accent-alpha, 1))',
  /** Floating native surfaces share workbench cards. */
  '--histoire-panel': 'var(--histoire-surface)',
}
</script>

<template>
  <HistoireProvider :session="session" class="histoire-app" :style="workbenchTheme" @error="emit('error', $event)">
    <WorkbenchApp v-bind="props" @error="emit('error', $event)" />
  </HistoireProvider>
</template>
