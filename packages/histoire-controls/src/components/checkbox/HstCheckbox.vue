<script lang="ts">
export default {
  name: 'HstCheckbox',
}
</script>

<script lang="ts" setup>
import { computed } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import HstSimpleCheckbox from './HstSimpleCheckbox.vue'

type Booleanish = boolean | 'true' | 'false'

const props = defineProps<{
  title?: string
}>()

const value = defineModel<Booleanish | null>({ default: null })

function toggle() {
  if (typeof value.value === 'string') {
    value.value = (value.value === 'false' ? 'true' : 'false')
    return
  }

  value.value = !value.value
}

const isTrue = computed(() => {
  if (typeof value.value === 'string') {
    return value.value !== 'false'
  }

  return value.value
})
</script>

<template>
  <HstWrapper
    role="checkbox"
    tabindex="0"
    class="histoire-checkbox htw-cursor-pointer htw-items-center"
    :title="title"
    @click="toggle()"
    @keydown.enter.prevent="toggle()"
    @keydown.space.prevent="toggle()"
  >
    <HstSimpleCheckbox :model-value="!!isTrue" />
    <template #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
