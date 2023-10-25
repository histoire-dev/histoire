<script setup lang="ts">
import { ref, toRefs } from 'vue'
import { useTransition, syncRefs } from '@vueuse/core'
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

const { count } = toRefs(props)
const delayedCount = ref(0)

const animatedCount = useTransition(delayedCount, { delay: 100, duration: 700 })

syncRefs(count, delayedCount)
</script>

<template>
  <div class="htw-p-2 htw-flex htw-items-center htw-gap-x-2">
    <Icon
      :icon="props.icon"
      class="htw-text-2xl htw-text-gray-700 dark:htw-text-gray-300 htw-flex-none"
    />
    <div class="htw-flex htw-flex-col htw-leading-none">
      <span
        class="htw-text-primary-500 htw-min-w-[80px] htw-font-bold"
      >
        {{ animatedCount.toFixed() }}
      </span>
      <span
        class="htw-text-sm htw-text-gray-900 dark:htw-text-gray-100"
      >
        {{ title }}
      </span>
    </div>
  </div>
</template>
