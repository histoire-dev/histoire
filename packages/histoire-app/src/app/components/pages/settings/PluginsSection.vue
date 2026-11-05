<script setup lang="ts">
import type { InstalledPlugin } from './plugins/types.js'
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { installedPlugins } from 'virtual:$histoire-config'
import { useContributionLookup } from '../../../composables/shell-extensions.js'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import InstalledPluginRow from './plugins/InstalledPluginRow.vue'
import MarketplacePrefs from './plugins/MarketplacePrefs.vue'
import PluginSettingsCard from './plugins/PluginSettingsCard.vue'
import { usePackageManager } from './plugins/use-package-manager.js'
import { usePluginToggles } from './usePluginToggles.js'

const emit = defineEmits<{ section: [section: string] }>()
const props = withDefaults(defineProps<{
  /** Owning runtime capability; static bundles default to read-only. */ dev?: boolean
}>(), { dev: __HISTOIRE_DEV__ })
const dev = props.dev
const store = useMarketplaceStore()
const updates = store.updates
const jobs = store.settingsJobs
const manager = usePackageManager(store, dev)
const sections = useContributionLookup('settings.section')
const toggles = usePluginToggles()

/** Show options reference while retaining the explicit configuration-editing action. */
function options(plugin: InstalledPlugin): void {
  if (plugin.packageName) store.showPlugin(plugin.packageName, 'options')
}
/** Plan and execute explicitly selected exact-version or removal actions. */
function change(plugin: InstalledPlugin, kind: 'pin' | 'remove'): void {
  if (!plugin.packageName || !dev || toggles.changes.value.length || toggles.pending.value) return
  void jobs.run({ id: plugin.packageName, kind, ...(kind === 'pin' ? { version: plugin.version } : {}), prefs: store.prefs.value })
}
/** Inline progress belongs only to the package being changed. */
function progress(plugin: InstalledPlugin): string | undefined {
  if (!plugin.packageName) return
  if (jobs.preparing.value === plugin.packageName) return 'Preparing plugin change'
  if (jobs.active.value?.id === plugin.packageName && jobs.active.value.status === 'running') return jobs.step.value
}
</script>

<template>
  <section class="htw:w-[min(100%,_740px)] htw:mx-auto">
    <div class="htw:flex htw:flex-wrap htw:items-center htw:justify-between htw:gap-4 htw:mb-[22px]">
      <h1 class="htw:m-0 htw:text-[25px] htw:font-bold">
        Plugins
      </h1>
      <HstButton color="primary" @click="store.openMarketplace('discover', $event.currentTarget)">
        <BuiltinIcon icon="search" :size="14" />
        Browse marketplace
      </HstButton>
    </div>
    <PluginSettingsCard v-if="installedPlugins.length" title="Installed">
      <template #actions>
        <HstButton v-if="dev && updates.count.value" :disabled="jobs.busy.value || toggles.pending.value || Boolean(toggles.changes.value.length)" @click="jobs.updateAll(updates.available.value)">
          Update all
        </HstButton>
      </template>
      <InstalledPluginRow
        v-for="(plugin, index) in installedPlugins" :key="index" :plugin="plugin" :dev="dev"
        :update="updates.available.value.find(item => item.id === plugin.packageName)?.to"
        :busy="jobs.busy.value || toggles.pending.value" :writes-blocked="Boolean(toggles.changes.value.length)"
        :enabled="toggles.value(plugin.toggleId ?? '', plugin.enabled)" :progress="progress(plugin)"
        :awaiting="jobs.active.value?.id === plugin.packageName ? jobs.active.value?.awaiting : undefined"
        :is-new="Boolean(plugin.packageName) && updates.newPlugin.value === plugin.packageName"
        :sections="sections.list().filter(section => plugin.id && section.pluginId === plugin.id)"
        @toggle="plugin.toggleId && toggles.set(plugin.toggleId, $event)" @section="emit('section', $event)"
        @update="plugin.packageName && store.openUpdate(plugin.packageName)" @options="options(plugin)"
        @changelog="plugin.packageName && store.showPlugin(plugin.packageName, 'changelog')" @pin="change(plugin, 'pin')" @remove="change(plugin, 'remove')"
        @acknowledge="updates.acknowledge()" @restart="jobs.restart()"
      />
    </PluginSettingsCard>
    <WorkbenchEmptyState v-else icon="puzzle" title="No plugins installed" />
    <p class="htw:m-[0_0_22px] htw:text-[12px] htw:text-muted">
      Plugin changes write to <code class="htw:font-mono">package.json</code> and <code class="htw:font-mono">histoire.config.ts</code>
    </p>
    <p v-if="updates.error.value" role="alert" class="htw:mb-4 htw:text-[12px]">
      {{ updates.error.value }} <HstButton color="flat" @click="updates.refresh(true)">
        Retry update check
      </HstButton>
    </p>
    <p v-if="jobs.error.value" role="alert" class="htw:mb-4 htw:text-[12px]">
      {{ jobs.error.value }}
    </p>
    <MarketplacePrefs :dev="dev" :manager="manager ?? jobs.manager.value" />
    <div v-if="dev && (toggles.changes.value.length || toggles.pending.value || toggles.error.value)" role="region" aria-label="Plugin changes" class="htw:sticky htw:bottom-4 htw:z-10 htw:ms-auto htw:mt-4 htw:flex htw:w-max htw:max-w-full htw:flex-wrap htw:items-center htw:justify-end htw:gap-2 htw:rounded-[12px] htw:bg-surface htw:p-2 htw:shadow-panel">
      <span v-if="toggles.error.value" role="alert" class="htw:text-danger-text htw:text-[12px]">
        {{ toggles.error.value }}
      </span>
      <span v-else-if="!toggles.pending.value" class="htw:px-1 htw:text-muted htw:text-[12px]">
        {{ toggles.changes.value.length }} {{ toggles.changes.value.length === 1 ? 'change' : 'changes' }}
      </span>
      <HstButton color="default" :disabled="toggles.pending.value" @click="toggles.discard()">
        <BuiltinIcon icon="close" :size="16" />
        Discard
      </HstButton>
      <HstButton color="primary" :disabled="jobs.busy.value || toggles.pending.value || !toggles.changes.value.length" @click="toggles.apply()">
        <HstPulsatingDisc v-if="toggles.pending.value" :size="12" />
        <BuiltinIcon v-else icon="renew" :size="16" />
        {{ toggles.pending.value ? 'Restarting Histoire' : 'Apply and restart' }}
      </HstButton>
    </div>
  </section>
</template>
