<script lang="ts">
export default {
  name: 'HstPresets',
}
</script>

<script lang="ts" setup>
import { ref, computed, watch, nextTick } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import CustomSelect from '../select/CustomSelect.vue'
import { Icon } from '@iconify/vue'
import cloneDeep from 'lodash/cloneDeep'
import assign from 'lodash/assign'
import { useStorage, onClickOutside } from '@vueuse/core'
import { VTooltip as vTooltip } from 'floating-vue'

const DEFAULT_ID = 'default'

const props = defineProps<{
  id: string
  state: Record<string, unknown>
}>()

const defaultState = cloneDeep(props.state)

const selectedOption = useStorage<string>(
  `_histoire-presets/${props.id}/selected`,
  DEFAULT_ID,
)

const presetStates = useStorage<Map<string, { state: Record<string, unknown>, label: string }>>(
  `_histoire-presets/${props.id}/states`,
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
const select = ref<HTMLInputElement>()
const canDelete = computed(() => selectedOption.value !== DEFAULT_ID)
const isEditing = ref(false)

async function savePreset () {
  const id = (new Date()).getTime().toString()

  presetStates.value.set(id, { state: cloneDeep(props.state), label: 'New preset' })
  selectedOption.value = id
  isEditing.value = true
  await nextTick()
  input.value.select()
}

function deletePreset () {
  if (!canDelete.value) {
    return
  }

  if (!confirm('Are you sure you want to delete this preset?')) {
    return
  }

  presetStates.value.delete(selectedOption.value)
  selectedOption.value = DEFAULT_ID
}

async function startEditing () {
  if (!canDelete.value) {
    return
  }

  isEditing.value = true
  await nextTick()
  input.value.select()
}

function stopEditing () {
  isEditing.value = false
}

onClickOutside(select, stopEditing)
</script>

<template>
  <HstWrapper
    title="Presets"
    class="htw-cursor-text htw-items-center"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <div class="htw-flex htw-gap-2 htw-w-full htw-items-center">
      <div
        ref="select"
        class="htw-flex-grow"
      >
        <CustomSelect
          v-model="selectedOption"
          :options="presetsOptions"
          @dblclick="startEditing"
          @keydown.enter="stopEditing"
        >
          <input
            v-if="isEditing"
            ref="input"
            v-model="presetStates.get(selectedOption).label"
            type="text"
            class="htw-text-inherit htw-bg-transparent htw-w-full htw-outline-none"
            @click.stop.prevent
          >
        </CustomSelect>
      </div>
      <Icon
        v-tooltip="'Create new preset'"
        icon="carbon:save"
        class="htw-cursor-pointer htw-w-[16px] htw-h-[16px] hover:htw-text-primary-500 htw-opacity-50 hover:htw-opacity-100 dark:hover:htw-text-primary-400 htw-text-gray-900 dark:htw-text-gray-100"
        @click="savePreset"
      />
      <Icon
        v-tooltip="canDelete ? 'Delete this preset' : null"
        icon="carbon:trash-can"
        class="htw-w-[16px] htw-h-[16px] htw-text-gray-900 dark:htw-text-gray-100"
        :class="canDelete ? 'htw-cursor-pointer hover:htw-text-primary-500 dark:hover:htw-text-primary-400 hover:htw-opacity-100 htw-opacity-50' : 'htw-opacity-20'"
        @click="deletePreset"
      />
    </div>
  </HstWrapper>
</template>
