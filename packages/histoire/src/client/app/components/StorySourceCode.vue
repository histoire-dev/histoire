<script lang="ts" setup>
import { PropType, ref, watchEffect } from 'vue'
import { generateSourceCode } from '../codegen/vue3'
import { Variant } from '../types'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },
})

const sourceCode = ref('')

watchEffect(async () => {
  sourceCode.value = await generateSourceCode(props.variant.slots().default({ state: props.variant.state }))
})
</script>

<template>
  <div>
    <textarea
      class="htw-w-full htw-h-full htw-p-2 htw-outline-none"
      :value="sourceCode"
      readonly
    />
  </div>
</template>
