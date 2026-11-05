<script setup lang="ts">
import type { ShellPane } from '../../stores/shell.js'
import { useHistoireControls } from '@histoire/controls/vue'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, onMounted } from 'vue'
import HistoireLogo from '../../assets/histoire.svg'
import { useContributionLookup } from '../../composables/shell-extensions.js'
import { useShell } from '../../composables/shell.js'
import { useAgentsStore } from '../../stores/agents.js'
import { useOptionalMarketplaceStore } from '../../stores/marketplace.js'
import { useShortcutRegistry } from '../../util/shortcuts.js'
import { usePluginUpdates } from '../pages/settings/plugins/use-plugin-updates.js'
import { useSettingsJobs } from '../pages/settings/plugins/use-settings-jobs.js'
import { getPluginRailBadge, type RailBadgeTone, type RailItem, railItems, toPluginRailItem } from './rail-items.js'
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
const panes = useContributionLookup('shell.pane')
const emit = defineEmits<{ home: [], pane: [pane: Exclude<ShellPane, 'home'>], settings: [], error: [error: unknown] }>()
const shell = useShell()
const context = useHistoireContext()
const dark = useHistoireControls()!.dark
const shortcuts = useShortcutRegistry()
// Plugin panes follow built-ins; the registry already hides dev-only panes in static books.
const items = computed(() => [...railItems.filter(item => shell.dev || !item.devOnly), ...panes.list().map(toPluginRailItem)])
const agents = useAgentsStore()
// Standalone workbenches provide marketplace; embedded shells may omit it.
const marketplace = useOptionalMarketplaceStore()
const updates = marketplace ? usePluginUpdates(marketplace, shell.dev) : undefined
if (marketplace) useSettingsJobs(marketplace, shell.dev)
/** Threads blocked on a question for the user. */
const waiting = computed(() => agents?.needsInput.value.length ?? 0)
/**
 * Badge count; the AI destination always shows threads waiting for input.
 * @param item Rail destination.
 */
function badgeFor(item: RailItem): number | string | undefined {
  const workbench = panes.workbench
  if (item.contribution && workbench) return getPluginRailBadge(item, workbench.context, error => workbench.host.reportViewError(item.id, error, 'update'))
  return item.id === 'ai' && waiting.value ? Math.max(props.badges?.ai ?? 0, waiting.value) : props.badges?.[item.id]
}
/**
 * Badge tone, raised to attention while an agent waits for the user.
 * @param item Rail destination.
 */
function toneFor(item: RailItem): RailBadgeTone | undefined {
  return item.id === 'ai' && waiting.value ? 'attention' : item.badgeTone
}
const logo = computed(() => props.logos?.square ?? (dark.value ? props.logos?.dark : props.logos?.light) ?? HistoireLogo)
let root: HTMLElement | null = null

/** Explicit provider settings retain standalone color-scheme storage adapter. */
function toggleTheme(): void {
  void context.session.settings.update({ colorScheme: dark.value ? 'light' : 'dark' }).catch(error => emit('error', error))
}
/** Home is URL navigation; pane preferences never encode route identity. */
function activate(pane: ShellPane): void {
  if (pane === 'home') emit('home')
  else emit('pane', pane)
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
  <!-- Mobile rail layout follows the nearest workbench container. -->
  <nav class="htw:flex htw:flex-col htw:items-center htw:gap-2 htw:py-2.5 htw:px-2 htw:min-h-0 htw:border-e htw:border-border htw:bg-surface htw:[@container(max-width:640px)]:flex-row htw:[@container(max-width:640px)]:justify-between htw:[@container(max-width:640px)]:gap-0.5 htw:[@container(max-width:640px)]:py-2 htw:[@container(max-width:640px)]:px-1 htw:[@container(max-width:640px)]:border-e-0 htw:[@container(max-width:640px)]:border-t htw:[@container(max-width:640px)]:[--histoire-rail-button-size:min(40px,calc((100cqw_-_8px)/var(--histoire-rail-action-count)_-_2px))]" aria-label="Workbench" :style="{ '--histoire-rail-action-count': items.length + (hideTheme ? 2 : 3) }">
    <a class="htw:grid htw:place-items-center htw:size-10 htw:flex-[0_0_40px] htw:mb-0.5 htw:rounded-[10px] htw:focus-visible:outline-2 htw:focus-visible:outline-accent htw:focus-visible:outline-offset-2 htw:[@container(max-width:640px)]:hidden" :href="logoHref ?? homeHref" :target="logoHref ? '_blank' : undefined" :rel="logoHref ? 'noopener noreferrer' : undefined" aria-label="Histoire home" @click="activateLogo">
      <img class="htw:object-contain" :src="logo" alt="" width="28" height="28">
    </a>
    <div class="htw:flex htw:flex-col htw:gap-1 htw:[@container(max-width:640px)]:contents">
      <RailButton
        v-for="item in items" :key="item.id"
        :label="item.label" :icon="item.icon"
        :active="(item.id === 'home' ? homeActive : !homeActive && shell.pane.value === item.id && shell.panelOpen.value) && !settingsActive"
        :expanded="item.id === 'home' ? undefined : shell.pane.value === item.id && shell.panelOpen.value"
        :controls="item.id === 'home' ? undefined : panelId"
        :badge="badgeFor(item)"
        :badge-tone="toneFor(item)"
        :test-id="item.id === 'search' ? 'search-btn' : undefined"
        :data-shell-pane="item.id"
        @click="activate(item.id)"
      />
    </div>
    <div class="htw:flex htw:flex-col htw:gap-1 htw:mt-auto htw:[@container(max-width:640px)]:contents">
      <RailButton v-if="!hideTheme" label="Toggle dark mode" :icon="dark ? 'light' : 'asleep'" test-id="dark-toggle" @click="toggleTheme" />
      <RailButton :label="shell.panelOpen.value ? 'Collapse side panel' : 'Expand side panel'" :icon="shell.panelOpen.value ? 'side-panel-close' : 'side-panel-open'" :expanded="shell.panelOpen.value" :controls="panelId" @click="shell.togglePanel" />
      <RailButton label="Settings" icon="settings" :badge="updates?.count.value || undefined" badge-tone="accent" :active="settingsActive" :disabled="!settingsAvailable" @click="emit('settings')" />
    </div>
  </nav>
</template>
