<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import { HstCopyIcon } from '@histoire/controls'
import { Icon } from '@iconify/vue'
import { useResizeObserver } from '@vueuse/core'
import { computed, ref, toRefs } from 'vue'
import { usePreviewSettingsStore } from '../../stores/preview-settings'
import { histoireConfig } from '../../util/config'
import { isDark } from '../../util/dark'
import { getSourceCode } from '../../util/docs'
import { getContrastColor } from '../../util/preview-settings'
import { useScrollOnActive } from '../../util/scroll'
import CheckerboardPattern from '../misc/CheckerboardPattern.vue'
import ToolbarNewTab from '../toolbar/ToolbarNewTab.vue'
import GenericRenderStory from './GenericRenderStory.vue'

const props = defineProps<{
  story: Story
  variant: Variant
  selected: boolean
}>()

const emit = defineEmits<{
  ready: []
  resize: [width: number, height: number]
  select: []
}>()

const { selected, variant } = toRefs(props)
const el = ref<HTMLDivElement>()
const previewReady = ref(false)

const { autoScroll } = useScrollOnActive(selected, el)

useResizeObserver(el, () => {
  if (!previewReady.value || !el.value) {
    return
  }

  emit('resize', el.value.clientWidth, el.value.clientHeight)

  if (selected.value) {
    autoScroll()
  }
})

const settings = usePreviewSettingsStore().currentSettings
const contrastColor = computed(() => getContrastColor(settings))
const autoApplyContrastColor = computed(() => !!histoireConfig.autoApplyContrastColor)

function onReady() {
  previewReady.value = true
  emit('ready')
}
</script>

<template>
  <div
    ref="el"
    class="histoire-story-variant-grid-item htw-cursor-default htw-flex htw-flex-col htw-gap-y-1 htw-group"
    :data-histoire-variant-id="variant.id"
  >
    <div class="htw-flex-none htw-flex htw-items-center">
      <button
        v-tooltip="variant.title"
        type="button"
        class="htw-rounded htw-w-max htw-px-2 htw-py-0.5 htw-min-w-16 htw-cursor-pointer htw-flex htw-items-center htw-gap-1 htw-flex-shrink htw-bg-transparent"
        :class="{
          'hover:htw-bg-gray-200 htw-text-gray-500 dark:hover:htw-bg-gray-800': !selected,
          'htw-bg-primary-200 hover:htw-bg-primary-300 htw-text-primary-800 dark:htw-bg-primary-700 dark:hover:htw-bg-primary-800 dark:htw-text-primary-200': selected,
        }"
        @click="emit('select')"
      >
        <Icon
          :icon="variant.icon ?? 'carbon:cube'"
          class="htw-w-4 htw-h-4 htw-opacity-50"
          :class="{
            'htw-text-gray-500': !selected && !variant.iconColor,
            'bind-icon-color': !selected && variant.iconColor,
          }"
        />
        <span class="htw-truncate htw-flex-1">{{ variant.title }}</span>
      </button>

      <div class="htw-flex-none htw-ml-auto htw-hidden group-hover:htw-flex htw-items-center">
        <HstCopyIcon
          :content="() => getSourceCode(story, variant)"
        />
        <ToolbarNewTab
          :variant="variant"
          :story="story"
        />
      </div>
    </div>

    <div
      class="htw-border htw-bg-white dark:htw-bg-gray-700 htw-rounded htw-flex-1 htw-p-4 htw-relative"
      :class="{
        'htw-border-gray-100 dark:htw-border-gray-800': !selected,
        'htw-border-primary-200 dark:htw-border-primary-900': selected,
      }"
      data-test-id="sandbox-render"
      @click.stop="emit('select')"
      @keyup="emit('select')"
    >
      <div
        class="htw-absolute htw-inset-0 htw-rounded bind-preview-bg"
        data-test-id="responsive-preview-bg"
      />

      <CheckerboardPattern
        v-if="settings.checkerboard"
        class="htw-absolute htw-inset-0 htw-w-full htw-h-full htw-text-gray-500/20"
      />

      <div
        class="htw-relative htw-h-full"
        :style="{
          '--histoire-contrast-color': contrastColor,
          'color': autoApplyContrastColor ? contrastColor : undefined,
        }"
      >
        <GenericRenderStory
          :key="`${story.id}-${variant.id}`"
          :story="story"
          :variant="variant"
          :dir="settings.textDirection"
          :class="{
            [histoireConfig.theme.darkClass]: isDark,
          }"
          @ready="onReady"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.bind-icon-color {
  color: v-bind('variant.iconColor');
}

.bind-preview-bg {
  background-color: v-bind('settings.backgroundColor');
}
</style>
