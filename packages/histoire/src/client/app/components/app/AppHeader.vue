<script setup lang="ts">
import { useDark, useToggle } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { isDark, toggleDark } from '../../util/dark'

const carbonIcon = computed(() => {
  return isDark.value ? 'carbon:moon' : 'carbon:sun'
})
</script>

<template>
  <div
    class="htw-px-4 htw-h-12 htw-flex htw-items-center"
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
