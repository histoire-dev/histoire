<script setup lang="ts">
import type { CatalogPage } from '@histoire/shared'
import { HstButton } from '@histoire/controls/vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import PluginTile from '../shell/PluginTile.vue'
import PluginInstallAction from './PluginInstallAction.vue'

defineProps<{
  /** Compatible recommendation with a project-specific reason. */ plugin: NonNullable<NonNullable<CatalogPage['discover']>['hero']>
}>()
const store = useMarketplaceStore()
</script>

<template>
  <section :aria-label="`Recommended: ${plugin.displayName}`" class="htw:flex htw:min-w-0 htw:flex-col htw:gap-[12px] htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface htw:p-[22px]">
    <div class="htw:flex htw:items-center htw:gap-[12px]">
      <PluginTile :plugin="plugin" :size="48" class="htw:text-[15px]" />
      <div class="htw:min-w-0">
        <h3 class="htw:m-0 htw:text-[18px] htw:font-extrabold">
          {{ plugin.displayName }}
        </h3>
        <div class="htw:text-[13px] htw:text-muted">
          <template v-if="plugin.official">
            Official ·
          </template>{{ plugin.publisher }}
        </div>
      </div>
    </div>
    <p class="htw:m-0 htw:text-[14px] htw:text-body">
      {{ plugin.summary }}
    </p>
    <span class="htw:inline-flex htw:min-h-[22px] htw:self-start htw:items-center htw:rounded-full htw:bg-accent-soft htw:px-[9px] htw:text-[11px] htw:font-semibold htw:text-accent-text">{{ plugin.reason }}</span>
    <div class="htw:mt-auto htw:flex htw:items-center htw:gap-[8px]">
      <PluginInstallAction :plugin="plugin" primary />
      <HstButton color="flat" :aria-label="`Details for ${plugin.displayName}`" @click="store.showPlugin(plugin.id)">
        Details
      </HstButton>
    </div>
  </section>
</template>
