<script setup lang="ts">
import type { ShellPane } from '../../stores/shell.js'
import { useHistoireControls } from '@histoire/controls/vue'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, onMounted } from 'vue'
import HistoireLogo from '../../assets/histoire.svg'
import { useShell } from '../../composables/shell.js'
import { useShortcutRegistry } from '../../util/shortcuts.js'
import { railItems } from './rail-items.js'
import RailButton from './RailButton.vue'
import { handleShellShortcut } from './shortcuts.js'

const props = defineProps<{
  /** ID of shell's shared side-panel region. */
  panelId: string
  /** Exact home destination is supplied by standalone route adapter. */
  homeHref: string
  /** Active Home route takes highlight priority over every side pane. */
  homeActive?: boolean
  /** Configured external logo target, if any. */
  logoHref?: string
  /** Existing theme logo files, already resolved by project build. */
  logos?: { square?: string, light?: string, dark?: string }
  /** Registered settings route availability. */
  settingsAvailable?: boolean
  /** Active settings route. */
  settingsActive?: boolean
  /** Hide switch according to existing theme option. */
  hideTheme?: boolean
  /** Dev status counts from caller-owned services. */
  badges?: Partial<Record<ShellPane, number>>
}>()
const emit = defineEmits<{ home: [], settings: [], error: [error: unknown] }>()
const shell = useShell()
const context = useHistoireContext()
const dark = useHistoireControls()!.dark
const shortcuts = useShortcutRegistry()
const items = computed(() => railItems.filter(item => shell.dev || !item.devOnly))
const logo = computed(() => props.logos?.square ?? (dark.value ? props.logos?.dark : props.logos?.light) ?? HistoireLogo)
let root: HTMLElement | null = null

/** Explicit provider settings retain standalone color-scheme storage adapter. */
function toggleTheme(): void {
  void context.session.settings.update({ colorScheme: dark.value ? 'light' : 'dark' }).catch(error => emit('error', error))
}
/** Home is URL navigation; pane preferences never encode route identity. */
function activate(pane: ShellPane): void {
  if (pane === 'home') emit('home')
  else shell.selectPane(pane)
}
/** Project logo links retain external behavior; default logo uses owned router. */
function activateLogo(event: MouseEvent): void {
  if (props.logoHref) return
  event.preventDefault()
  activate('home')
}
/** A root listener includes dialogs but never handles another nested provider. */
function keydown(event: KeyboardEvent): void {
  if (!shortcuts && !props.hideTheme) handleShellShortcut(event, root, toggleTheme)
}
if (shortcuts) useHistoireResource(shortcuts.register({ id: 'global.theme', label: 'Toggle dark mode', keys: ['mod+shift+d'], scope: 'global', allowInput: true, enabled: () => !props.hideTheme, handler: toggleTheme }))
onMounted(() => {
  root = context.root.value
  root?.addEventListener('keydown', keydown)
})
useHistoireResource(() => {
  root?.removeEventListener('keydown', keydown)
  root = null
})
</script>

<template>
  <nav class="histoire-app-rail" aria-label="Workbench">
    <a class="histoire-rail-logo" :href="logoHref ?? homeHref" :target="logoHref ? '_blank' : undefined" :rel="logoHref ? 'noopener noreferrer' : undefined" aria-label="Histoire home" @click="activateLogo">
      <img :src="logo" alt="" width="28" height="28">
    </a>
    <div class="histoire-rail-destinations">
      <RailButton
        v-for="item in items" :key="item.id"
        :label="item.label" :icon="item.icon"
        :active="(item.id === 'home' ? homeActive : !homeActive && shell.pane.value === item.id && shell.panelOpen.value) && !settingsActive"
        :expanded="item.id === 'home' ? undefined : shell.pane.value === item.id && shell.panelOpen.value"
        :controls="item.id === 'home' ? undefined : panelId"
        :badge="badges?.[item.id]"
        :badge-tone="item.badgeTone"
        :test-id="item.id === 'search' ? 'search-btn' : undefined"
        :data-shell-pane="item.id"
        @click="activate(item.id)"
      />
    </div>
    <div class="histoire-rail-tools">
      <RailButton v-if="!hideTheme" label="Toggle dark mode" :icon="dark ? 'light' : 'asleep'" test-id="dark-toggle" @click="toggleTheme" />
      <RailButton :label="shell.panelOpen.value ? 'Collapse side panel' : 'Expand side panel'" :icon="shell.panelOpen.value ? 'side-panel-close' : 'side-panel-open'" :expanded="shell.panelOpen.value" :controls="panelId" @click="shell.togglePanel" />
      <RailButton label="Settings" icon="settings" :active="settingsActive" :disabled="!settingsAvailable" @click="emit('settings')" />
    </div>
  </nav>
</template>

<style scoped>
.histoire-app-rail { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px 8px; min-height: 0; border-inline-end: 1px solid var(--histoire-border); background: var(--histoire-surface); }
.histoire-rail-logo { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 40px; margin-bottom: 2px; border-radius: 10px; }
.histoire-rail-logo:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: 2px; }
.histoire-rail-logo img { object-fit: contain; }
.histoire-rail-destinations, .histoire-rail-tools { display: flex; flex-direction: column; gap: 4px; }
.histoire-rail-tools { margin-top: auto; }
@container (max-width: 640px) {
  .histoire-app-rail { flex-direction: row; gap: 2px; padding: 8px 4px; border-inline-end: 0; border-block-start: 1px solid var(--histoire-border); }
  .histoire-rail-logo { display: none; }
  /* Share available width across every action so Settings stays reachable. */
  .histoire-rail-destinations, .histoire-rail-tools { display: contents; }
}
</style>
