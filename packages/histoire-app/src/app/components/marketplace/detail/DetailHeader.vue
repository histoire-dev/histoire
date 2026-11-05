<script setup lang="ts">
import type { PluginDetail } from '@histoire/shared'
import { BuiltinIcon } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import MenuItem from '../../menu/MenuItem.vue'
import WorkbenchPanelAction from '../../shell/WorkbenchPanelAction.vue'
import { categories } from '../browse/labels.js'
import PluginTile from '../shell/PluginTile.vue'

const props = defineProps<{
  /** Validated catalog identity and installation state. */ plugin: PluginDetail
}>()
const store = useMarketplaceStore()
/** Prefer the compatible installed update over the latest catalog release. */
const target = computed(() => props.plugin.installed?.update ?? props.plugin.latest)
/** Main action reflects installation state and its exact target version. */
const label = computed(() => props.plugin.installed ? props.plugin.installed.update ? `Update to ${target.value}` : `Installed ${props.plugin.installed.version}` : 'Install')
/** Installed packages without updates and incompatible packages cannot install. */
const disabled = computed(() => !props.plugin.compatible.ok || Boolean(props.plugin.installed && !props.plugin.installed.update))

/** Show the server's version-specific incompatibility in disabled menu items. */
function reason(version: PluginDetail['versions'][number]): string | undefined {
  return version.compatible ? undefined : version.reason ?? 'Incompatible with this project'
}
/** Start a wizard only; project changes still require the later review action. */
function install(version = target.value): void {
  if (disabled.value || props.plugin.versions.some(item => item.version === version && !item.compatible)) return
  store.startInstall({ id: props.plugin.id, kind: props.plugin.installed ? 'update' : 'install', version, prefs: { ...store.prefs.value, skippedVersions: { ...store.prefs.value.skippedVersions } } })
}

/** Return to this category without losing the user's query or other facets. */
function browseCategory(): void {
  store.setFilters({ ...store.filters.value, category: props.plugin.category })
  store.setView('all')
}
</script>

<template>
  <header>
    <nav aria-label="Plugin breadcrumb" class="htw:mb-[18px] htw:flex htw:items-center htw:gap-[6px] htw:font-semibold htw:text-muted">
      <button type="button" class="htw:m-0 htw:cursor-pointer htw:border-0 htw:bg-transparent htw:p-0 htw:text-inherit htw:[font:inherit] htw:hover:text-accent-text htw:focus-visible:outline-2 htw:focus-visible:outline-accent" @click="store.setView('all')">
        All plugins
      </button>
      <span aria-hidden="true"> / </span>
      <button type="button" class="htw:m-0 htw:cursor-pointer htw:border-0 htw:bg-transparent htw:p-0 htw:text-inherit htw:[font:inherit] htw:hover:text-accent-text htw:focus-visible:outline-2 htw:focus-visible:outline-accent" @click="browseCategory">
        {{ categories[plugin.category] }}
      </button>
    </nav>
    <div class="htw:flex htw:flex-wrap htw:items-center htw:gap-[18px]">
      <PluginTile :plugin="plugin" :size="64" class="htw:text-[20px]" />
      <div class="htw:min-w-[260px] htw:flex-1">
        <div class="htw:flex htw:flex-wrap htw:items-center htw:gap-[10px]">
          <h1 class="htw:m-0 htw:text-[28px] htw:font-extrabold htw:tracking-[-0.02em] htw:text-text">
            {{ plugin.displayName }}
          </h1>
          <span v-if="plugin.official" class="htw:inline-flex htw:h-[22px] htw:shrink-0 htw:items-center htw:rounded-full htw:bg-accent-soft htw:px-[9px] htw:text-[11px] htw:font-semibold htw:text-accent-text">Official</span>
        </div>
        <p class="htw:m-0 htw:mt-[2px] htw:text-muted">
          <code class="htw:font-mono">{{ plugin.id }}</code> · by {{ plugin.publisher }}
        </p>
        <p v-if="plugin.installed?.update" class="htw:m-0 htw:mt-2 htw:text-muted">
          Installed {{ plugin.installed.version }}
        </p>
      </div>
      <WorkbenchPanelAction icon="add-alt" :label="label" :disabled="disabled" menu-label="Choose version" :menu-width="280" :overlay-target="store.overlayTarget.value" @click="install()">
        <template v-if="plugin.versions.length" #menu="{ close }">
          <MenuItem v-for="version in plugin.versions" :key="version.version" :label="version.version" :disabled="reason(version)" @click="install(version.version); close()" />
        </template>
      </WorkbenchPanelAction>
      <a v-if="plugin.docsUrl" :href="plugin.docsUrl" aria-label="Documentation" target="_blank" rel="noopener noreferrer" class="htw:box-border htw:inline-flex htw:size-[32px] htw:shrink-0 htw:items-center htw:justify-center htw:rounded-[8px] htw:border htw:border-solid htw:border-border htw:bg-surface htw:text-text htw:no-underline htw:hover:text-accent-text htw:focus-visible:outline-2 htw:focus-visible:outline-accent">
        <BuiltinIcon icon="launch" :size="16" />
      </a>
    </div>
    <p v-if="!plugin.compatible.ok" role="status" class="htw:m-0 htw:mt-[18px] htw:rounded-lg htw:bg-warn/10 htw:p-3 htw:text-warn">
      {{ plugin.compatible.reason ?? 'Incompatible with this project' }}
    </p>
  </header>
</template>
