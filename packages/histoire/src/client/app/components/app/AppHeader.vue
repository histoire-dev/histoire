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
    class="htw-px-4 htw-h-16 htw-flex htw-items-center"
  >
    <AppLogo
      class="htw-h-full htw-py-3"
    />
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
