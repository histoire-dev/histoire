<script setup lang="ts">
import { Icon } from '@iconify/vue'
import BaseListItem from '../base/BaseListItem.vue'

defineProps<{
  title: string
  icon: string
  stateIcon?: string
  isActive?: boolean
}>()

defineEmits<{
  (e: 'click'): void
}>()
</script>

<template>
  <BaseListItem
    :is-active="isActive"
    class="htw-px-6 htw-py-4 htw-gap-4"
    @navigate="$emit('click')"
  >
    <Icon
      class="htw-w-4 htw-h-4 htw-flex-none"
      :icon="icon"
      aria-hidden="true"
    />
    <span class="htw-flex-1">{{ title }}</span>
    <Icon
      v-if="stateIcon"
      class="htw-w-4 htw-h-4 htw-flex-none htw-opacity-70"
      :icon="stateIcon"
      aria-hidden="true"
    />
  </BaseListItem>
</template>
