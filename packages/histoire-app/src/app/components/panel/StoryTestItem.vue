<script lang="ts" setup>
import type { HistoireResolvedTestCase } from '@histoire/shared'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import StoryTestErrorItem from './StoryTestErrorItem.vue'

const props = defineProps<{
  test: HistoireResolvedTestCase
}>()

/**
 * Returns the user-facing label for a test state.
 */
const label = computed(() => {
  return props.test.state === 'idle' ? 'Not run' : props.test.state
})

/**
 * Returns the text color classes for a test state.
 */
const textClass = computed(() => {
  switch (props.test.state) {
    case 'passed':
      return 'htw-text-emerald-600 dark:htw-text-emerald-300'
    case 'failed':
      return 'htw-text-red-600 dark:htw-text-red-300'
    case 'skipped':
      return 'htw-text-gray-500 dark:htw-text-gray-300'
  }
  return 'htw-text-amber-600 dark:htw-text-amber-300'
})

const borderClass = computed(() => {
  switch (props.test.state) {
    case 'failed':
      return 'htw-border-red-400 dark:htw-border-red-500'
  }
  return 'htw-border-gray-100 dark:htw-border-gray-750'
})

const icon = computed(() => {
  switch (props.test.state) {
    case 'passed':
      return 'carbon:checkmark'
    case 'failed':
      return 'carbon:close-large'
    case 'skipped':
      return 'carbon:skip-forward'
  }
  return 'carbon:circle-dash'
})
</script>

<template>
  <div
    class="htw-rounded htw-border htw-p-3 htw-space-y-2"
    :class="borderClass"
    data-test-id="story-test-row"
  >
    <div class="htw-flex htw-items-center htw-justify-between htw-gap-3">
      <Icon
        :icon
        :class="textClass"
      />
      <div class="htw-text-sm htw-font-medium htw-text-start htw-flex-1 htw-min-w-0 htw-truncate">
        {{ props.test.name }}
      </div>
      <span
        class="htw-text-xs htw-uppercase htw-tracking-wide"
        :class="textClass"
      >
        {{ label }}
      </span>
    </div>

    <div
      v-if="props.test.errors.length"
      class="htw-space-y-2"
    >
      <StoryTestErrorItem
        v-for="(error, errorIndex) in props.test.errors"
        :key="`${props.test.id}-${errorIndex}`"
        :error="error"
      />
    </div>
  </div>
</template>
