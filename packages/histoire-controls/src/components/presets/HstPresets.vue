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
import { useStorage } from '@vueuse/core'

const DEFAULT_ID = 'default'

const props = defineProps<{
  id: string
  state: Record<string, unknown>
}>()

const defaultState = cloneDeep(props.state)

const selectedOption = useStorage<string>(
  '_histoire-presets/' + props.id + '/selected',
  DEFAULT_ID,
)

const presetStates = useStorage<Map<string, { state: unknown, label: string }>>(
  '_histoire-presets/' + props.id + '/states',
  new Map(),
)

const presetsOptions = computed(() => {
  const options = { [DEFAULT_ID]: 'Default' }
  presetStates.value.forEach((value, key) => {
    options[key] = value.label
  })
  return options
})

watch(() => selectedOption.value, () => {
  if (selectedOption.value === DEFAULT_ID) {
    assign(props.state, defaultState)
    return
  }
  if (presetStates.value.has(selectedOption.value)) {
    assign(props.state, presetStates.value.get(selectedOption.value).state)
  }
}, { immediate: true })

const input = ref<HTMLInputElement>()

const canDelete = computed(() => selectedOption.value !== DEFAULT_ID)

function savePreset () {
  const label = prompt('Name your preset')
  if (!label) {
    return
  }
  const id = (new Date()).getTime().toString()

  presetStates.value.set(id, { state: cloneDeep(props.state), label })

  selectedOption.value = id
}

function deleteSelected () {
  if (!canDelete.value) {
    return
  }

  if (!confirm('Are you sure you want to delete this preset?')) {
    return
  }

  presetStates.value.delete(selectedOption.value)

  selectedOption.value = DEFAULT_ID
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
        @click="deleteSelected"
      />
    </div>
  </HstWrapper>
</template>
