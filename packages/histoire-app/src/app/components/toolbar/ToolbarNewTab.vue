<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { getSandboxUrl } from '../../util/sandbox'
import TopBarChipItem from '../app/TopBarChipItem.vue'

const props = defineProps<{
  variant: Variant
  story: Story
}>()

const sandboxUrl = computed(() => {
  return getSandboxUrl(props.story, props.variant)
})
</script>

<template>
  <TopBarChipItem
    v-tooltip="'Open variant in new tab'"
    :href="sandboxUrl"
    target="_blank"
    class="histoire-toolbar-new-tab"
  >
    <Icon
      icon="carbon:launch"
      class="htw-w-4 htw-h-4"
    />
  </TopBarChipItem>
</template>
