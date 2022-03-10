<script lang="ts" setup>
import { PropType, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { Story, Variant } from '../../types'
import { histoireConfig } from '../../util/config'
import { usePreviewSettings } from '../../util/preview-settings'
import StoryResponsivePreview from './StoryResponsivePreview.vue'

defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },

  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})

const settings = usePreviewSettings()
</script>

<template>
  <div class="htw-h-full htw-flex htw-flex-col">
    <!-- Toolbar -->
    <div class="htw-flex-none htw-flex htw-items-center htw-h-8 -htw-mt-1">
      <!-- Variant title -->
      <div class="htw-flex htw-items-center htw-gap-1 htw-text-gray-500 htw-flex-1 htw-truncate htw-min-w-0">
        <Icon
          :icon="variant.icon ?? 'carbon:cube'"
          class="base-list-item-link-icon htw-w-4 htw-h-4 htw-opacity-50"
          :class="[
            variant.iconColor ? 'bind-icon-color' : 'htw-text-gray-500',
          ]"
        />
        <span>{{ variant.title }}</span>
      </div>

      <!-- Responsive size -->
      <VDropdown
        placement="bottom-end"
        :skidding="6"
        :disabled="!histoireConfig.responsivePresets?.length"
        class="htw-h-full htw-flex-none"
      >
        <div
          v-tooltip="'Responsive sizes'"
          class="htw-flex htw-items-center htw-gap-1 htw-h-full htw-px-2"
          :class="{
            'htw-cursor-pointer hover:htw-text-primary-500': histoireConfig.responsivePresets?.length,
          }"
        >
          <Icon
            icon="ic:baseline-phone-android"
            class="htw-w-4 htw-h-4 htw-opacity-50"
          />
          <Icon
            icon="carbon:caret-down"
            class="htw-w-4 htw-h-4 htw-opacity-50"
          />
        </div>

        <template #popper="{ hide }">
          <div class="htw-flex htw-flex-col htw-items-stretch">
            <HstCheckbox
              v-model="settings.rotate"
            >
              Rotate
            </HstCheckbox>

            <div class="htw-flex htw-gap-2 htw-px-4 htw-py-3">
              <input
                v-model.number="settings.responsiveWidth"
                v-tooltip="'Responsive width (px)'"
                type="number"
                class="htw-bg-transparent htw-border htw-border-gray-200 dark:htw-border-gray-850 htw-rounded htw-w-20 htw-opacity-50 focus:htw-opacity-100 htw-flex-1 htw-min-w-0"
                step="16"
                placeholder="Auto"
              >
              <span class="htw-opacity-50">x</span>
              <input
                v-model.number="settings.responsiveHeight"
                v-tooltip="'Responsive height (px)'"
                type="number"
                class="htw-bg-transparent htw-border htw-border-gray-200 dark:htw-border-gray-850 htw-rounded htw-w-20 htw-opacity-50 focus:htw-opacity-100 htw-flex-1 htw-min-w-0"
                step="16"
                placeholder="Auto"
              >
            </div>

            <button
              v-for="(preset, index) in histoireConfig.responsivePresets"
              :key="index"
              class="htw-bg-transparent hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700 htw-px-4 htw-py-3 htw-cursor-pointer htw-text-left htw-flex htw-gap-4"
              :class="{
                'htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white dark:htw-text-black': settings.responsiveWidth === preset.width && settings.responsiveHeight === preset.height,
              }"
              @click="settings.responsiveWidth = preset.width;settings.responsiveHeight = preset.height;hide()"
            >
              {{ preset.label }}
              <span class="htw-ml-auto htw-opacity-70 htw-flex htw-gap-1">
                <span v-if="preset.width">{{ preset.width }}<span v-if="!preset.height">px</span></span>
                <span v-if="preset.width && preset.height">x</span>
                <span v-if="preset.height">{{ preset.height }}<span v-if="!preset.width">px</span></span>
              </span>
            </button>
          </div>
        </template>
      </VDropdown>

      <!-- Background -->
      <VDropdown
        v-if="histoireConfig.backgroundPresets.length"
        placement="bottom-end"
        :skidding="6"
        class="htw-h-full htw-flex-none"
      >
        <div
          v-tooltip="'Background color'"
          class="htw-cursor-pointer hover:htw-text-primary-500 htw-flex htw-items-center htw-gap-1 htw-h-full htw-px-2"
        >
          <div
            class="bind-preview-bg htw-w-4 htw-h-4 htw-rounded-full htw-border htw-border-black/20 dark:htw-border-white/20"
          />
          <Icon
            icon="carbon:caret-down"
            class="htw-w-4 htw-h-4 htw-opacity-50"
          />
        </div>

        <template #popper="{ hide }">
          <div class="htw-flex htw-flex-col htw-items-stretch">
            <HstCheckbox
              v-model="settings.checkerboard"
            >
              Checkerboard
            </HstCheckbox>

            <button
              v-for="(option, index) in histoireConfig.backgroundPresets"
              :key="index"
              class="htw-bg-transparent hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700 htw-px-4 htw-py-3 htw-cursor-pointer htw-text-left htw-flex htw-gap-4"
              :class="{
                'htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white dark:htw-text-black': settings.backgroundColor === option.color,
              }"
              @click="settings.backgroundColor = option.color;hide()"
            >
              <span class="htw-mr-auto">{{ option.label }}</span>
              <template v-if="option.color !== '$checkerboard'">
                <span class="htw-ml-auto htw-opacity-70">{{ option.color }}</span>
                <div
                  class="htw-w-4 htw-h-4 htw-rounded-full htw-border htw-border-black/20 dark:htw-border-white/20"
                  :style="{
                    backgroundColor: option.color,
                  }"
                />
              </template>
            </button>
          </div>
        </template>
      </VDropdown>
    </div>

    <!-- Preview -->
    <StoryResponsivePreview
      :story="story"
      :variant="variant"
      :settings="settings"
    />
  </div>
</template>

<style scoped>
.bind-preview-bg {
  background-color: v-bind('settings.backgroundColor');
}
</style>
