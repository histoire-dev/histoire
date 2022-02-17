<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import AppLogo from './AppLogo.vue'
import { isDark, toggleDark } from '../../util/dark'

const carbonIcon = computed(() => {
  return isDark.value ? 'carbon:moon' : 'carbon:sun'
})
</script>

<template>
  <div
    class="htw-px-4 htw-h-16 htw-flex htw-items-center htw-gap-2"
  >
    <div class="htw-py-4 htw-flex-1 htw-h-full htw-flex htw-items-center htw-pr-2">
      <AppLogo
        class="htw-max-w-full htw-max-h-full"
      />
    </div>
    <div class="htw-ml-auto htw-flex-none">
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
