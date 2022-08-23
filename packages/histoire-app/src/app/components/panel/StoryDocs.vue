<script lang="ts">
import { PropType, Ref, ref, toRefs, watchEffect } from 'vue'
import type { Story } from '../../types'
// @ts-expect-error virtual module
import { markdownFiles } from 'virtual:$histoire-markdown-files'

export function useStoryDoc (story: Ref<Story>) {
  const renderedDoc = ref('')

  watchEffect(async () => {
    // Markdown file
    const mdKey = story.value.file.filePath.replace(/\.(\w*?)$/, '.md')
    if (markdownFiles[mdKey]) {
      const md = await markdownFiles[mdKey]()
      renderedDoc.value = md.html
      return
    }

    // Custom blocks (Vue)
    // @TODO extract
    let comp = story.value.file?.component
    if (comp) {
      if (comp.__asyncResolved) {
        comp = comp.__asyncResolved
      } else if (comp.__asyncLoader) {
        comp = await comp.__asyncLoader()
      } else if (typeof comp === 'function') {
        try {
          comp = await comp()
        } catch (e) {
          // Noop
          // Could be a class that requires `new com()`
        }
      }
      if (comp?.default) {
        comp = comp.default
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
import { Icon } from '@iconify/vue'
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
