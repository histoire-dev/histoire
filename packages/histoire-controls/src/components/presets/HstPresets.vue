<script lang="ts">
export default {
  name: 'HstPresets',
}
</script>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import CustomSelect, { CustomSelectOptions } from '../select/CustomSelect.vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  state: Record<string, unknown>
}>()

const presetsOptions: Array<CustomSelectOptions> = [
  { label: 'Default', value: 'default' },
]

const selectedOption = ref('default')

let defaultState

onMounted(() => {
  defaultState = { ...props.state }
})

const input = ref<HTMLInputElement>()
</script>

<template>
  <HstWrapper
    title="Presets"
    class="htw-cursor-text htw-items-center"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <div class="htw-flex htw-gap-2 htw-w-full htw-items-center">
      <CustomSelect
        v-model="selectedOption"
        :options="presetsOptions"
        class="htw-flex-grow"
      />
      <Icon
        icon="carbon:save"
        class="htw-cursor-pointer htw-w-[16px] htw-h-[16px] hover:htw-text-primary-500 htw-opacity-50 hover:htw-opacity-100 dark:hover:htw-text-primary-400 htw-text-gray-900 dark:htw-text-gray-100"
      />
      <Icon
        icon="carbon:trash-can"
        class="htw-cursor-pointer htw-w-[16px] htw-h-[16px] hover:htw-text-primary-500 htw-opacity-50 hover:htw-opacity-100 dark:hover:htw-text-primary-400 htw-text-gray-900 dark:htw-text-gray-100"
      />
    </div>
  </HstWrapper>
</template>
