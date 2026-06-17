<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { usePreviewSettingsStore } from '../../stores/preview-settings'
import { histoireConfig } from '../../util/config'
import BaseCheckbox from '../base/BaseCheckbox.vue'

const settings = usePreviewSettingsStore().currentSettings
</script>

<template>
  <VDropdown
    v-if="histoireConfig.backgroundPresets.length"
    placement="bottom-end"
    :skidding="6"
    class="histoire-toolbar-background htw-flex-none"
    data-test-id="toolbar-background"
  >
    <div
      v-tooltip="'Background color'"
      class="htw-flex htw-items-center htw-gap-1 htw-px-2.5 htw-py-1.5 hover:htw-bg-white/50 dark:hover:htw-bg-white/10 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer htw-text-gray-900 dark:htw-text-gray-100 htw-transition-colors htw-group"
    >
      <Icon
        icon="carbon:color-palette"
        class="htw-w-4 htw-h-4"
      />
      <Icon
        icon="carbon:chevron-down"
        class="htw-w-3 htw-h-3 htw-opacity-40 group-hover:htw-opacity-70"
      />
    </div>

    <template #popper="{ hide }">
      <div
        class="htw-flex htw-flex-col htw-items-stretch"
        data-test-id="background-popper"
      >
        <BaseCheckbox v-model="settings.checkerboard">
          Checkerboard
        </BaseCheckbox>

        <button
          v-for="(option, index) in histoireConfig.backgroundPresets"
          :key="index"
          class="htw-px-4 htw-py-3 htw-cursor-pointer htw-text-left htw-flex htw-items-baseline htw-gap-4"
          :class="[
            settings.backgroundColor === option.color
              ? 'htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white dark:htw-text-black'
              : 'htw-bg-transparent hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700',
          ]"
          @click="settings.backgroundColor = option.color;hide()"
        >
          <span class="htw-mr-auto">{{ option.label }}</span>
          <template v-if="option.color !== '$checkerboard'">
            <span class="htw-ml-auto htw-opacity-70">{{ option.color }}</span>
            <div
              class="htw-w-4 htw-h-4 htw-rounded-full htw-border htw-border-black/20 dark:htw-border-white/20 htw-flex htw-items-center htw-justify-center htw-text-xs"
              :style="{
                backgroundColor: option.color,
                color: option.contrastColor,
              }"
            >
              <span v-if="option.contrastColor">a</span>
            </div>
          </template>
        </button>
      </div>
    </template>
  </VDropdown>
</template>

<style scoped>
.bind-preview-bg {
  background-color: v-bind('settings.backgroundColor');
  color: v-bind('contrastColor');
}
</style>
