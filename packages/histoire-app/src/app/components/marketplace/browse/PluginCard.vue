<script setup lang="ts">
import type { CatalogEntry } from '@histoire/shared'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import PluginTile from '../shell/PluginTile.vue'
import { additions } from './labels.js'
import MatchText from './MatchText.vue'
import PluginInstallAction from './PluginInstallAction.vue'

const props = withDefaults(defineProps<{
  /** Server-owned metadata and joined installation state. */ plugin: CatalogEntry
  /** Optional project recommendation supplied by Discover. */ reason?: string
  /** Result row inside a shared card, or compact project recommendation. */ layout?: 'list' | 'pick'
}>(), { layout: 'list' })
const store = useMarketplaceStore()
/** Keep the same content/actions across rows and picks; only their grid placement changes. */
const layouts = {
  /** Search rows share their enclosing card border and separate each result. */
  list: 'htw:grid-cols-[40px_minmax(0,1fr)_auto] htw:gap-x-[14px] htw:gap-y-[4px] htw:border-0 htw:border-b htw:border-solid htw:border-border htw:px-[18px] htw:py-[16px] htw:last:border-b-0',
  /** Compact recommendations keep install next to the heading. */
  pick: 'htw:flex-1 htw:grid-cols-[40px_minmax(0,1fr)_auto] htw:gap-x-[12px] htw:gap-y-[6px] htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:p-[16px]',
}
/** Inclusive matches for exactly the field being rendered. */
function ranges(field: 'displayName' | 'summary' | 'id'): Array<[number, number]> {
  return props.plugin.match?.filter(match => match.field === field).flatMap(match => match.ranges) ?? []
}
</script>

<template>
  <article class="htw:grid htw:min-w-0 htw:content-start htw:bg-surface htw:text-[13px]" :class="layouts[layout]" @click="store.showPlugin(plugin.id)">
    <PluginTile :plugin="plugin" :size="40" class="htw:col-start-1 htw:row-start-1 htw:row-span-3 htw:text-[13px]" />
    <div class="htw:col-start-2 htw:row-start-1 htw:min-w-0 htw:self-center" :class="layout === 'list' ? 'htw:flex htw:flex-wrap htw:items-baseline htw:gap-[8px]' : ''">
      <div class="htw:flex htw:flex-wrap htw:items-center htw:gap-[6px]">
        <h3 class="htw:m-0 htw:text-[14px] htw:font-extrabold">
          <button type="button" :aria-label="`Details for ${plugin.displayName}`" class="htw:m-0 htw:cursor-pointer htw:rounded-[3px] htw:border-0 htw:bg-transparent htw:p-0 htw:text-left htw:text-inherit htw:[font:inherit] htw:hover:text-accent-text htw:focus-visible:outline-2 htw:focus-visible:outline-accent" @click.stop="store.showPlugin(plugin.id)">
            <MatchText :text="plugin.displayName" :ranges="ranges('displayName')" />
          </button>
        </h3>
      </div>
      <span v-if="layout === 'list'" class="htw:break-all htw:font-mono htw:text-[11px] htw:text-muted"><MatchText :text="plugin.id" :ranges="ranges('id')" /></span>
      <span v-if="plugin.official && layout === 'list'" class="htw:inline-flex htw:h-[18px] htw:items-center htw:rounded-full htw:bg-accent-soft htw:px-[6px] htw:text-[11px] htw:font-semibold htw:text-accent-text">Official</span>
    </div>
    <PluginInstallAction :plugin="plugin" class="htw:col-start-3 htw:row-start-1 htw:self-start" />
    <p class="htw:col-start-2 htw:row-start-2 htw:m-0 htw:text-body">
      <MatchText :text="plugin.summary" :ranges="ranges('summary')" />
    </p>
    <div v-if="layout === 'list'" class="htw:col-start-2 htw:row-start-3 htw:mt-[4px] htw:flex htw:flex-wrap htw:items-center htw:gap-[6px]">
      <span v-for="kind in [...new Set(plugin.adds.map(add => add.kind))]" :key="kind" class="htw:inline-flex htw:h-[22px] htw:items-center htw:rounded-full htw:bg-chip htw:px-[9px] htw:text-[11px] htw:font-semibold htw:text-body">{{ additions[kind] }}</span>
    </div>
    <span v-if="reason && layout === 'pick'" class="htw:col-start-2 htw:row-start-3 htw:inline-flex htw:min-h-[22px] htw:justify-self-start htw:items-center htw:rounded-full htw:bg-accent-soft htw:px-[9px] htw:text-[11px] htw:font-semibold htw:text-accent-text">{{ reason }}</span>
    <p v-if="!plugin.compatible.ok" class="htw:col-span-full htw:m-0 htw:text-[12px] htw:text-muted">
      {{ plugin.compatible.reason || 'Incompatible with this project' }}
    </p>
  </article>
</template>
