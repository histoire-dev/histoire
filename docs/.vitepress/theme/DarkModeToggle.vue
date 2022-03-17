<script lang="ts" setup>
import { computed } from 'vue'
import { isDark, toggleDark } from './util/dark'

const themeIcon = computed(() => {
  return isDark.value ? 'carbon:moon' : 'carbon:sun'
})
</script>

<template>
  <div class="htw-pt-2 htw-ml-4">
    <a
      class="htw-text-current htw-p-2 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer"
      @click="toggleDark()"
    >
      <Icon
        :icon="themeIcon"
        class="htw-w-6 htw-h-6 sm:htw-w-4 sm:htw-h-4"
      />
    </a>
  </div>
</template>
