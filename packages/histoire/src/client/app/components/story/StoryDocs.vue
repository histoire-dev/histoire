<script lang="ts" setup>
import { PropType, ref, watchEffect } from 'vue'
import type { Story } from '../../types'
import BaseEmpty from '../base/BaseEmpty.vue'

const props = defineProps({
  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})

const renderedDoc = ref('')

watchEffect(async () => {
  let comp = props.story.file?.component
  if (comp.__asyncResolved) {
    comp = comp.__asyncResolved
  } else if (comp.__asyncLoader) {
    comp = await comp.__asyncLoader()
  }
  renderedDoc.value = comp.doc
})
</script>

<template>
  <BaseEmpty
    v-if="!renderedDoc"
  >
    No documentation available
  </BaseEmpty>
  <div
    v-else
    class="htw-prose htw-p-4 htw-max-w-none"
    v-html="renderedDoc"
  />
</template>
