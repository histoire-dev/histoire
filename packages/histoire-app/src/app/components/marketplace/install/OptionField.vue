<script setup lang="ts">
import type { HistoireJsonValue } from '@histoire/protocol'
import type { MarketplaceOption } from '@histoire/shared'
import { HstButtonGroup, HstSelect, HstSwitch, HstText, HstTextarea } from '@histoire/controls/vue'
import { computed, useId } from 'vue'

const props = defineProps<{
  /** Declarative field, never executable package code. */ option: MarketplaceOption
  /** Current literal value. */ modelValue?: HistoireJsonValue
}>()
const emit = defineEmits<{
  /** Publish a typed literal edit. */ 'update:modelValue': [value: HistoireJsonValue]
}>()
const id = `marketplace-option-${useId()}`
const descriptionId = computed(() => props.option.description ? `${id}-description` : undefined)
/** One selector per line; empty rows never become config entries. */
function updateList(value: string): void {
  emit('update:modelValue', value.split('\n').map(line => line.trim()).filter(Boolean))
}
</script>

<template>
  <div class="htw:grid htw:gap-1.5">
    <div v-if="option.type === 'boolean'" class="htw:flex htw:items-center htw:justify-between htw:gap-3">
      <div class="htw:grid htw:gap-1">
        <label :for="id" class="htw:font-bold">{{ option.label }}</label>
        <p v-if="option.description" :id="descriptionId" class="htw:m-0 htw:text-xs htw:text-muted">
          {{ option.description }}
        </p>
      </div>
      <HstSwitch :id="id" :title="option.label" layout="inline" :aria-label="option.label" :aria-describedby="descriptionId" :model-value="modelValue === true" @update:model-value="emit('update:modelValue', $event)" />
    </div>
    <template v-else>
      <component :is="option.type === 'enum' && option.display === 'segmented' ? 'span' : 'label'" :for="option.type === 'enum' && option.display === 'segmented' ? undefined : id" class="htw:font-bold">
        {{ option.label }}
      </component>
      <HstButtonGroup v-if="option.type === 'enum' && option.display === 'segmented'" :id="id" :title="option.label" layout="inline" :aria-label="option.label" :options="option.choices ?? []" :model-value="modelValue" :aria-describedby="descriptionId" @update:model-value="emit('update:modelValue', $event)" />
      <HstSelect v-else-if="option.type === 'enum'" :id="id" :title="option.label" layout="inline" :aria-label="option.label" :options="option.choices ?? []" :model-value="modelValue" :aria-describedby="descriptionId" @update:model-value="emit('update:modelValue', $event)" />
      <HstTextarea v-else-if="option.type === 'string-list'" :id="id" class="htw:w-full" :title="option.label" layout="inline" :aria-label="option.label" :model-value="Array.isArray(modelValue) ? modelValue.join('\n') : ''" :rows="3" :aria-describedby="descriptionId" input-class="htw:font-mono htw:text-xs" @update:model-value="updateList" />
      <HstText v-else :id="id" class="htw:w-full" :title="option.label" layout="inline" :aria-label="option.label" :model-value="typeof modelValue === 'string' ? modelValue : ''" :aria-describedby="descriptionId" @update:model-value="emit('update:modelValue', $event)" />
      <p v-if="option.description" :id="descriptionId" class="htw:m-0 htw:text-xs htw:text-muted">
        {{ option.description }}
      </p>
    </template>
  </div>
</template>
