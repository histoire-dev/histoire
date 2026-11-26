<script setup lang="ts">
import { useToolbarPresentation } from '../../base/overflow/presentation.js'
import ToolbarButton from './ToolbarButton.vue'

defineProps<{
  /** Exact current-story matching frames; matrix tuples are excluded. */
  count: number
  /** Reveal cursor position; zero means canonical frame does not match. */
  position: number
}>()
const emit = defineEmits<{
  /** Reveal previous matching frame without canonical activation. */
  previous: []
  /** Reveal next matching frame without canonical activation. */
  next: []
}>()

const presentation = useToolbarPresentation()
</script>

<template>
  <span v-if="count > 0" :data-presentation="presentation" class="htw:flex htw:items-center htw:flex-none htw:gap-0.5 htw:group/search-stepper htw:data-[presentation=menu]:flex-col htw:data-[presentation=menu]:items-stretch htw:data-[presentation=menu]:gap-px htw:data-[presentation=menu]:p-0 htw:data-[presentation=menu]:bg-transparent">
    <ToolbarButton label="Previous search match" icon="chevron-up" @click="emit('previous')" />
    <span class="htw:[line-height:normal] htw:min-w-9 htw:text-muted htw:font-mono htw:text-[11px] htw:text-center htw:whitespace-nowrap htw:group-data-[presentation=menu]/search-stepper:py-1 htw:group-data-[presentation=menu]/search-stepper:px-2 htw:group-data-[presentation=menu]/search-stepper:text-start" role="status" aria-label="Search matches" aria-live="polite">{{ position }} / {{ count }}</span>
    <ToolbarButton label="Next search match" icon="chevron-down" @click="emit('next')" />
  </span>
</template>
