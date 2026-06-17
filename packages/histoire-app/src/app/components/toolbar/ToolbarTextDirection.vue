<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { usePreviewSettingsStore } from '../../stores/preview-settings'
import TopBarChipItem from '../app/TopBarChipItem.vue'

const settings = usePreviewSettingsStore().currentSettings
</script>

<template>
  <TopBarChipItem
    v-tooltip="`Switch to text direction ${settings.textDirection === 'ltr' ? 'Right to Left' : 'Left to Right'}`"
    class="histoire-toolbar-text-direction"
    @click="settings.textDirection = settings.textDirection === 'ltr' ? 'rtl' : 'ltr'"
  >
    <Icon
      :icon="settings.textDirection === 'ltr' ? 'fluent:text-paragraph-direction-right-16-regular' : 'fluent:text-paragraph-direction-left-16-regular'"
      class="htw-w-4 htw-h-4"
    />
  </TopBarChipItem>
</template>
