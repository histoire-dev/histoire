<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { histoireConfig } from '../../util/config'
import { isDark, toggleDark } from '../../util/dark'
import { isMobile } from '../../util/responsive'
import { makeTooltip } from '../../util/tooltip'
import TopBarChip from './TopBarChip.vue'
import TopBarChipItem from './TopBarChipItem.vue'

defineEmits({
  search: () => true,
  layout: () => true,
})

const themeIcon = computed(() => {
  return isDark.value ? 'carbon:moon' : 'carbon:sun'
})
</script>

<template>
  <TopBarChip>
    <TopBarChipItem
      v-if="!isMobile"
      v-tooltip="makeTooltip('Layout', ({ isMac }) => isMac ? 'meta+shift+l' : 'ctrl+shift+l')"
      aria-label="Open layout customization"
      data-test-id="layout-btn"
      @click="$emit('layout')"
    >
      <Icon
        icon="carbon:panel-expansion"
        class="htw-w-4 htw-h-4"
      />
    </TopBarChipItem>

    <TopBarChipItem
      v-tooltip="makeTooltip('Search', ({ isMac }) => isMac ? 'meta+k' : 'ctrl+k')"
      data-test-id="search-btn"
      @click="$emit('search')"
    >
      <Icon
        icon="carbon:search"
        class="htw-w-4 htw-h-4"
      />
    </TopBarChipItem>

    <TopBarChipItem
      v-if="!histoireConfig.theme.hideColorSchemeSwitch"
      v-tooltip="makeTooltip('Toggle dark mode', ({ isMac }) => isMac ? 'meta+shift+d' : 'ctrl+shift+d')"
      @click="toggleDark()"
    >
      <Icon
        :icon="themeIcon"
        class="htw-w-4 htw-h-4"
      />
    </TopBarChipItem>
  </TopBarChip>
</template>
