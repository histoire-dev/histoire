<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTransition } from '@vueuse/core'
import { Icon } from '@iconify/vue'

const props = defineProps({
  icon: {
    type: String,
    default: 'carbon:cube',
  },
  title: {
    type: String,
    default: '',
  },
  count: {
    type: Number,
    default: 0,
  },
})

const source = ref(0)

const output = useTransition(source, { delay: 1000 })

watch(() => props.count, (newVal) => { source.value = newVal })
</script>

<template>
  <div class="htw-bg-gray-100 dark:htw-bg-gray-750 htw-p-4 md:htw-p-8 htw-text-center htw-flex htw-items-center htw-gap-x-2 md:htw-gap-x-4 htw-rounded htw-border htw-border-gray-500/30">
    <Icon
      :icon="props.icon"
      class="htw-text-6xl htw-text-gray-900 dark:htw-text-gray-100"
    />
    <div class="htw-flex htw-flex-col htw-gap-y-2 md:htw-gap-4">
      <span
        class="htw-text-primary-500 htw-text-4xl htw-min-w-[100px]"
        v-text="output.toFixed()"
      />
      <span
        class="htw-text-base htw-text-gray-900 dark:htw-text-gray-100"
        v-text="title"
      />
    </div>
  </div>
</template>
