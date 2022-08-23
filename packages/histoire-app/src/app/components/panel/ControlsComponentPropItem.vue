<script lang="ts" setup>
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { PropDefinition, AutoPropComponentDefinition } from '@histoire/shared'
import {
  HstText,
  HstNumber,
  HstCheckbox,
  HstTextarea,
} from '@histoire/controls'
import type { Variant } from '../../types'

const props = defineProps<{
  variant: Variant
  component: AutoPropComponentDefinition
  definition: PropDefinition
}>()

const comp = computed(() => {
  switch (props.definition.types?.[0]) {
    case 'string':
      return HstText
    case 'number':
      return HstNumber
    case 'boolean':
      return HstCheckbox
    case 'object':
    default:
      return HstTextarea
  }
})

const isJSON = computed(() => comp.value === HstTextarea)

const invalidValue = ref('')

const model = computed({
  get: () => {
    if (invalidValue.value) {
      return invalidValue.value
    }
    let val = props.variant.state._hPropState[props.component.index]?.[props.definition.name]
    if (val && isJSON.value) {
      val = JSON.stringify(val, null, 2)
    }
    return val
  },
  set: (value) => {
    invalidValue.value = ''
    if (isJSON.value) {
      try {
        value = JSON.parse(value)
      } catch (e) {
        invalidValue.value = value
        return
      }
    }
    if (!props.variant.state._hPropState[props.component.index]) {
      // eslint-disable-next-line vue/no-mutating-props
      props.variant.state._hPropState[props.component.index] = {}
    }
    // eslint-disable-next-line vue/no-mutating-props
    props.variant.state._hPropState[props.component.index][props.definition.name] = value
  },
})

function reset () {
  if (props.variant.state._hPropState[props.component.index]) {
    // eslint-disable-next-line vue/no-mutating-props
    delete props.variant.state._hPropState[props.component.index][props.definition.name]
  }
}

const canReset = computed(() => props.variant.state?._hPropState?.[props.component.index] && props.definition.name in props.variant.state._hPropState[props.component.index])
</script>

<template>
  <component
    :is="comp"
    v-if="comp"
    v-model="model"
    :title="`${definition.name}${canReset ? ' *' : ''}`"
    :placeholder="isJSON ? 'Enter JSON' : null"
  >
    <template #actions>
      <Icon
        v-if="invalidValue"
        v-tooltip="'JSON error'"
        icon="carbon:warning-alt"
        class="htw-text-orange-500"
      />

      <Icon
        v-tooltip="'Remove override'"
        icon="carbon:erase"
        class="htw-cursor-pointer htw-w-4 htw-h-4 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-text-gray-900 dark:htw-text-gray-100"
        :class="[
          canReset ? 'htw-opacity-50 hover:htw-opacity-100' : 'htw-opacity-25 htw-pointer-events-none',
        ]"
        @click.stop="reset()"
      />
    </template>
  </component>
</template>
