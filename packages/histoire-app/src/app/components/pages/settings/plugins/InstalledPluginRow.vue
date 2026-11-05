<script setup lang="ts">
import type { CatalogEntry, JobState } from '@histoire/shared'
import type { InstalledPlugin } from './types.js'
import { BuiltinIcon, HstButton, HstPulsatingDisc, HstSwitch } from '@histoire/controls/vue'
import { officialPlugins } from 'virtual:$histoire-marketplace-official'
import { computed } from 'vue'
import { useMarketplaceStore } from '../../../../stores/marketplace.js'
import PluginTile from '../../../marketplace/shell/PluginTile.vue'
import { builtinLogos } from './builtin-logos.js'
import PluginActionsMenu from './PluginActionsMenu.vue'

const props = defineProps<{
  /** Installed metadata in authored configuration order. */ plugin: InstalledPlugin
  /** Compatible update version, after skip preferences. */ update?: string
  /** Shared server and toggle submission exclusion. */ busy: boolean
  /** Staged toggles must be applied or discarded before other writes. */ writesBlocked: boolean
  /** Active progress label for this package only. */ progress?: string
  /** Paused job: `continue` resumes it, `restart` needs a manual dev server restart. */ awaiting?: JobState['awaiting']
  /** Latest successful install has not been acknowledged. */ isNew: boolean
  /** Project writes only exist in development. */ dev: boolean
  /** Staged enable value, before config mutation. */ enabled: boolean
  /** Plugin-contributed settings destinations. */ sections: Array<{ /** Qualified section identity. */ id: string, /** Visible section label. */ label: string }>
}>()
const emit = defineEmits<{
  /** Stage enable switch only. */ toggle: [enabled: boolean]
  /** Open update review. */ update: []
  /** Edit declarative config. */ options: []
  /** Read release notes. */ changelog: []
  /** Pin installed version. */ pin: []
  /** Confirmed package removal. */ remove: []
  /** Dismiss the install receipt marker. */ acknowledge: []
  /** Resume the paused job. */ restart: []
  /** Open a contributed settings section. */ section: [id: string]
}>()
const name = computed(() => props.plugin.displayName || props.plugin.name)
const store = useMarketplaceStore()
/** Prefer catalog artwork; local names get stable initials and a deterministic tint offline. */
const tile = computed<Pick<CatalogEntry, 'displayName' | 'logoUrl' | 'monogram' | 'tint'>>(() => {
  const catalog = store.page.value?.entries.find(item => item.id === props.plugin.packageName)
    ?? officialPlugins.find(item => item.id === props.plugin.packageName)
  if (catalog) return { ...catalog, logoUrl: props.plugin.logoUrl ?? catalog.logoUrl }
  const builtin = props.plugin.builtin ? builtinLogos[props.plugin.name] : undefined
  const words = name.value.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? [name.value]
  const monogram = words.length > 1 ? words.slice(0, 2).map(word => word[0]).join('') : name.value.slice(0, 2)
  const tints: CatalogEntry['tint'][] = ['green', 'violet', 'blue', 'amber', 'rose', 'sky', 'slate']
  const hash = [...name.value].reduce((value, character) => (value * 31 + character.codePointAt(0)!) >>> 0, 0)
  return { displayName: name.value, logoUrl: props.plugin.logoUrl ?? builtin?.logoUrl, monogram, tint: builtin?.tint ?? tints[hash % tints.length] }
})
</script>

<template>
  <div class="htw:flex htw:flex-wrap htw:items-center htw:gap-3.5 htw:border-0 htw:border-b htw:border-solid htw:border-border htw:px-5 htw:py-3 htw:last:border-b-0" :class="isNew ? 'htw:bg-accent-soft' : ''">
    <PluginTile :plugin="tile" :size="40" class="htw:size-[36px]! htw:text-[12px]" />
    <div class="htw:flex-1 htw:min-w-0">
      <div class="htw:flex htw:flex-wrap htw:items-center htw:gap-2">
        <strong class="htw:break-words htw:text-[14px] htw:font-bold">{{ name }}</strong>
        <HstButton v-if="isNew" color="flat" tone="accent" class="htw:h-[22px] htw:rounded-full htw:bg-accent-soft htw:px-[9px] htw:text-[11px] htw:font-semibold" :aria-label="`Acknowledge ${name}`" @click="emit('acknowledge')">
          New
        </HstButton>
      </div>
      <span v-if="plugin.packageName" class="htw:block htw:text-muted htw:font-mono htw:text-[11px] htw:break-all">{{ plugin.packageName }}</span>
      <span v-if="plugin.description" class="htw:block htw:text-muted htw:text-[12px]">{{ plugin.description }}</span>
      <span v-if="progress" role="status" aria-live="polite" class="htw:inline-flex htw:items-center htw:gap-2 htw:text-[12px] htw:text-muted">
        <HstPulsatingDisc v-if="!awaiting" :size="12" />{{ progress }}
        <HstButton v-if="awaiting === 'continue'" color="flat" @click="emit('restart')">Restart now</HstButton>
      </span>
    </div>
    <span class="htw:w-[56px] htw:shrink-0 htw:font-mono htw:text-[12px] htw:text-muted">{{ plugin.local ? 'local' : plugin.version || 'local' }}</span>
    <HstButton v-if="dev && update" class="htw:h-[28px] htw:text-accent-link htw:text-[12px]" :aria-label="`Update to ${update}`" :disabled="busy || writesBlocked" @click="emit('update')">
      <BuiltinIcon icon="arrow-up" :size="12" />{{ update }}
    </HstButton>
    <HstButton v-if="dev && plugin.packageName && !plugin.local && !sections.length" icon-only color="flat" :aria-label="`Options for ${name}`" :disabled="busy || writesBlocked" @click="emit('options')">
      <BuiltinIcon icon="settings" :size="16" />
    </HstButton>
    <HstButton v-for="item in sections" :key="item.id" icon-only color="default" :aria-label="`Settings: ${item.label}`" @click="emit('section', item.id)">
      <BuiltinIcon icon="settings" :size="16" />
    </HstButton>
    <span v-if="plugin.builtin" class="htw:inline-flex htw:h-[22px] htw:shrink-0 htw:items-center htw:rounded-full htw:bg-chip htw:px-[9px] htw:text-[11px] htw:font-semibold htw:text-body">Built in</span>
    <span v-if="plugin.required || plugin.builtin" class="htw:inline-flex htw:h-[22px] htw:shrink-0 htw:items-center htw:rounded-full htw:bg-chip htw:px-[9px] htw:text-[11px] htw:font-semibold htw:text-body">Required</span>
    <HstSwitch v-if="dev && plugin.toggleId && !plugin.required && !plugin.builtin" layout="inline" :aria-label="`Enable ${name}`" :model-value="enabled" :disabled="busy" @update:model-value="emit('toggle', $event)" />
    <span class="htw:flex htw:w-[28px] htw:shrink-0 htw:justify-end">
      <PluginActionsMenu v-if="plugin.packageName || plugin.docsUrl || plugin.repoUrl" :plugin="plugin" :dev="dev" :busy="busy || writesBlocked" @options="emit('options')" @changelog="emit('changelog')" @pin="emit('pin')" @remove="emit('remove')" />
    </span>
  </div>
</template>
