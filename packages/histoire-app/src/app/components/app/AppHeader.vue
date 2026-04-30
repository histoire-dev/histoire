<script setup lang="ts">
import { histoireConfig } from '../../util/config'
import { toggleDark } from '../../util/dark'
import { onKeyboardShortcut } from '../../util/keyboard'
import AppLogo from './AppLogo.vue'

onKeyboardShortcut(['ctrl+shift+d', 'meta+shift+d'], (event) => {
  event.preventDefault()
  toggleDark()
})
</script>

<template>
  <div
    class="histoire-app-header htw-px-4 htw-h-14 htw-flex htw-items-center htw-gap-2"
  >
    <div class="htw-py-3 sm:htw-py-4 htw-flex-1 htw-h-full htw-flex htw-items-center htw-pr-2">
      <a
        :href="histoireConfig.theme?.logoHref"
        target="_blank"
        class="htw-w-full htw-h-full htw-flex htw-items-center"
      >
        <AppLogo
          class="htw-max-w-full htw-max-h-full"
        />
      </a>
    </div>
  </div>
</template>
