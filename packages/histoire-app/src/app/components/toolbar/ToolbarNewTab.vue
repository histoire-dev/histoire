<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { getSandboxUrl } from '../../util/sandbox'

const props = defineProps<{
  variant: Variant
  story: Story
}>()

const sandboxUrl = computed(() => {
  return getSandboxUrl(props.story, props.variant)
})
</script>

<template>
  <a
    v-tooltip="'Open variant in new tab'"
    :href="sandboxUrl"
    target="_blank"
    class="histoire-toolbar-new-tab htw:flex htw:items-center htw:gap-1 htw:h-full htw:px-2 htw:hover:text-primary-500 htw:opacity-50 htw:hover:opacity-100 htw:dark:hover:text-primary-400 htw:text-gray-900 htw:dark:text-gray-100"
  >
    <Icon
      icon="carbon:launch"
      class="htw:w-4 htw:h-4"
    />
  </a>
</template>
