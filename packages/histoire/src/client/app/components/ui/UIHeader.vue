<script setup lang="ts">
import { useDark, useToggle } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

const isDark = useDark({ valueDark: 'htw-dark' })
const toggleDark = useToggle(isDark)

const carbonIcon = computed(() => {
  return isDark.value ? 'carbon:moon' : 'carbon:sun'
})
</script>

<template>
  <div
    class="htw-border-gray-200 dark:htw-border-gray-600 htw-border-b htw-px-4 htw-py-4 htw-flex htw-items-center"
  >
    <div class="">
      Histoire
    </div>
    <div class="htw-ml-auto">
      <span
        class="hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer"
        @click="toggleDark()"
      >
        <Icon
          :icon="carbonIcon"
          class="htw-w-6 htw-h-6"
        />
      </span>
    </div>
  </div>
</template>
