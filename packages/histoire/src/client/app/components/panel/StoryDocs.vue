<script lang="ts">
export function useStoryDoc (story: Ref<Story>) {
  const renderedDoc = ref('')

  watchEffect(async () => {
    let comp = story.value.file?.component
    console.log(comp)
    if (comp) {
      if (comp.__asyncResolved) {
        comp = comp.__asyncResolved
      } else if (comp.__asyncLoader) {
        comp = await comp.__asyncLoader()
      }
      renderedDoc.value = comp.doc
    }
  })

  return {
    renderedDoc,
  }
}
</script>

<script lang="ts" setup>
import { PropType, Ref, ref, toRefs, watchEffect } from 'vue'
import { Icon } from '@iconify/vue'
import type { Story } from '../../types'
import BaseEmpty from '../base/BaseEmpty.vue'

const props = defineProps({
  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})

const { story } = toRefs(props)

const { renderedDoc } = useStoryDoc(story)
</script>

<template>
  <div>
    <BaseEmpty
      v-if="!renderedDoc"
    >
      <Icon
        icon="carbon:document-unknown"
        class="htw-w-8 htw-h-8 htw-opacity-50 htw-mb-6"
      />
      No documentation available
    </BaseEmpty>
    <div
      v-else
      class="htw-prose dark:htw-prose-invert htw-p-4 htw-max-w-none"
      data-test-id="story-docs"
      v-html="renderedDoc"
    />
  </div>
</template>
