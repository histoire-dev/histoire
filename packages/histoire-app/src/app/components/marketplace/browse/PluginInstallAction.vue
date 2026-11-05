<script setup lang="ts">
import type { CatalogEntry } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import BaseChip from '../../base/BaseChip.vue'
import { installPlugin } from './plugin-actions.js'

withDefaults(defineProps<{
  /** Actual installation status and target identity. */ plugin: CatalogEntry
  /** Hero action uses primary appearance. */ primary?: boolean
}>(), { primary: false })
const store = useMarketplaceStore()
</script>

<template>
  <BaseChip v-if="plugin.installed" tone="accent">
    <BuiltinIcon icon="checkmark" :size="12" />Installed
  </BaseChip>
  <HstButton v-else :color="primary ? 'primary' : 'default'" :aria-label="`Install ${plugin.displayName}`" :class="primary ? 'htw:h-[32px] htw:px-[12px] htw:text-[13px]' : 'htw:h-[28px] htw:px-[10px] htw:text-[12px]'" class="htw:shrink-0 htw:rounded-[8px]" @click.stop="installPlugin(store, plugin.id)">
    Install
  </HstButton>
</template>
