<script setup lang="ts">
import type { ChangePlan } from '@histoire/shared'
import { HstSwitch } from '@histoire/controls/vue'
import { useMarketplaceStore } from '../../../../stores/marketplace.js'
import SettingsChoices from '../SettingsChoices.vue'
import SettingsRow from '../SettingsRow.vue'
import PluginSettingsCard from './PluginSettingsCard.vue'

defineProps<{
  /** Project automation preferences only apply in development. */ dev: boolean
  /** Detection is reported only after the server supplies a plan. */ manager?: ChangePlan['packageManager']
}>()
const store = useMarketplaceStore()
</script>

<template>
  <PluginSettingsCard v-if="dev" title="Marketplace">
    <SettingsRow wrap>
      <div class="htw:flex-1">
        <strong class="htw:font-bold">Community plugins</strong><span class="htw:block htw:text-[12px] htw:text-muted">Show plugins not published by histoire-dev</span>
      </div>
      <HstSwitch v-model="store.prefs.value.community" layout="inline" aria-label="Community plugins" />
    </SettingsRow>
    <SettingsRow wrap>
      <div class="htw:flex-1">
        <strong class="htw:font-bold">Package manager</strong><span v-if="manager" class="htw:block htw:text-[12px] htw:text-muted">Detected from {{ manager.source }}</span>
      </div>
      <SettingsChoices v-model="store.prefs.value.packageManager" aria-label="Package manager" :options="[{ value: 'auto', label: 'Auto' }, { value: 'pnpm', label: 'pnpm' }, { value: 'npm', label: 'npm' }, { value: 'yarn', label: 'yarn' }, { value: 'bun', label: 'bun' }]" />
    </SettingsRow>
    <SettingsRow wrap>
      <div class="htw:flex-1">
        <strong class="htw:font-bold">After install</strong><span class="htw:block htw:text-[12px] htw:text-muted">Dev server restarts to load new plugins</span>
      </div>
      <SettingsChoices v-model="store.prefs.value.afterInstall" aria-label="After install" :options="[{ value: 'restart', label: 'Restart' }, { value: 'ask', label: 'Ask' }]" />
    </SettingsRow>
  </PluginSettingsCard>
</template>
