<script lang="ts">
export default {
  name: 'HstPresets',
}
</script>

<script lang="ts" setup>
import { ref, onMounted, computed, watch, reactive } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import CustomSelect from '../select/CustomSelect.vue'
import { Icon } from '@iconify/vue'
import cloneDeep from 'lodash/cloneDeep'
import assign from 'lodash/assign'

const props = defineProps<{
  state: Record<string, unknown>
}>()

const presetsOptions = reactive<Record<string, string>>({ default: 'Default' })
const presetStates = reactive<Record<string, Record<string, unknown>>>({})
const selectedOption = ref('default')

let defaultState

onMounted(() => {
  defaultState = cloneDeep(props.state)
  presetStates.default = defaultState
})

watch(() => selectedOption.value, () => {
  if (presetStates[selectedOption.value]) {
    assign(props.state, presetStates[selectedOption.value])
  }
})

const input = ref<HTMLInputElement>()

const canDelete = computed(() => selectedOption.value !== 'default')

function savePreset () {
  const label = prompt('Name your preset')
  if (!label) {
    return
  }
  const id = (new Date()).getTime().toString()

  presetsOptions[id] = label
  presetStates[id] = cloneDeep(props.state)

  selectedOption.value = id
}
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
        @click="savePreset"
      />
      <Icon
        icon="carbon:trash-can"
        class="htw-w-[16px] htw-h-[16px] htw-text-gray-900 dark:htw-text-gray-100"
        :class="canDelete ? 'htw-cursor-pointer hover:htw-text-primary-500 dark:hover:htw-text-primary-400 hover:htw-opacity-100 htw-opacity-50' : 'htw-opacity-20'"
      />
    </div>
  </HstWrapper>
</template>
