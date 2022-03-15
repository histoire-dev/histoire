<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import AppLogo from './AppLogo.vue'
import { isDark, toggleDark } from '../../util/dark'
import { onKeyboardShortcut } from '../../util/keyboard'
import { makeTooltip } from '../../util/tooltip'
import { histoireConfig } from '../../util/config'

defineEmits({
  search: () => true,
})

const themeIcon = computed(() => {
  return isDark.value ? 'carbon:moon' : 'carbon:sun'
})

onKeyboardShortcut(['ctrl+shift+d', 'meta+shift+d'], (event) => {
  toggleDark()
  event.preventDefault()
})
</script>

<template>
  <div
    class="htw-px-4 htw-h-16 htw-flex htw-items-center htw-gap-2"
  >
    <div class="htw-py-4 htw-flex-1 htw-h-full htw-flex htw-items-center htw-pr-2">
      <a
        :href="histoireConfig.theme?.logoHref"
        target="_blank"
        class="htw-block htw-w-full htw-h-full"
      >
        <AppLogo
          class="htw-max-w-full htw-max-h-full"
        />
      </a>
    </div>
    <div class="htw-ml-auto htw-flex-none htw-flex">
      <a
        v-tooltip="makeTooltip('Search', ({ isMac }) => isMac ? 'meta+k' : 'ctrl+k')"
        class="htw-p-1 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer"
        @click="$emit('search')"
      >
        <Icon
          icon="carbon:search"
          class="htw-w-5 htw-h-5"
        />
      </a>

      <a
        v-tooltip="makeTooltip('Toggle dark mode', ({ isMac }) => isMac ? 'meta+shift+d' : 'ctrl+shift+d')"
        class="htw-p-1 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer"
        @click="toggleDark()"
      >
        <Icon
          :icon="themeIcon"
          class="htw-w-5 htw-h-5"
        />
      </a>
    </div>
  </div>
</template>
