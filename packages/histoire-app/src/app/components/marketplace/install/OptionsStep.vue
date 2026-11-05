<script setup lang="ts">
import type { HistoireJsonValue } from '@histoire/protocol'
import type { ChangePlan, MarketplaceOption } from '@histoire/shared'
import { HstButton } from '@histoire/controls/vue'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'
import ConfigDiff from './ConfigDiff.vue'
import InstallFooter from './InstallFooter.vue'
import OptionField from './OptionField.vue'

defineProps<{
  /** Condition-filtered declarations. */ fields: MarketplaceOption[]
  /** Current form values by dot path. */ values: Record<string, HistoireJsonValue>
  /** Latest reviewed capability. */ plan?: ChangePlan
  /** Plans in flight disable forward navigation. */ loading: boolean
}>()
defineEmits<{
  /** Publish one literal edit. */ change: [key: string, value: HistoireJsonValue]
  /** Return to plugin details. */ cancel: []
  /** Advance only once current plan is available. */ continue: []
}>()
</script>

<template>
  <div class="htw:flex htw:flex-wrap">
    <div class="htw:flex htw:min-w-0 htw:flex-[1_1_300px] htw:flex-col htw:gap-5 htw:p-[22px]">
      <OptionField v-for="field in fields" :key="field.key" :option="field" :model-value="values[field.key]" @update:model-value="$emit('change', field.key, $event)" />
      <WorkbenchEmptyState v-if="!fields.length" icon="settings" title="No options" tone="neutral" />
    </div>
    <div class="htw:min-w-0 htw:flex-[1.4_1_440px] htw:bg-canvas htw:p-[22px]">
      <WorkbenchLoadingState v-if="loading" title="Planning changes" immediate />
      <ConfigDiff v-else-if="plan" :files="plan.files.filter(file => !file.path.endsWith('package.json'))" />
    </div>
  </div>
  <InstallFooter>
    <HstButton color="flat" @click="$emit('cancel')">
      Cancel
    </HstButton>
    <HstButton color="primary" :disabled="loading || !plan" @click="$emit('continue')">
      Continue
    </HstButton>
  </InstallFooter>
</template>
