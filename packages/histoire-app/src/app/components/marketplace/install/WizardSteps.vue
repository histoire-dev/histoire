<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'

defineProps<{
  /** Current zero-based wizard step. */ active: number
  /** Jobs lock navigation after admission. */ locked?: boolean
}>()
defineEmits<{
  /** Return to an already completed step. */ select: [step: number]
}>()
/** Fixed workflow order. */
const labels = ['Options', 'Review', 'Install']
</script>

<template>
  <nav aria-label="Install steps">
    <ol class="htw:m-0 htw:flex htw:list-none htw:flex-wrap htw:gap-3.5 htw:p-0">
      <li v-for="(label, index) in labels" :key="label" :aria-current="active === index ? 'step' : undefined" class="htw:flex htw:items-center htw:gap-1.5 htw:text-xs htw:font-semibold" :class="index === active ? 'htw:text-text' : 'htw:text-muted'">
        <span aria-hidden="true" class="htw:grid htw:size-5 htw:shrink-0 htw:place-items-center htw:rounded-full htw:text-[11px]" :class="index === active ? 'htw:bg-accent htw:text-surface' : index < active ? 'htw:bg-accent-soft htw:text-accent-text' : 'htw:bg-chip'">{{ index < active ? '✓' : index + 1 }}</span>
        <HstButton v-if="index < active && !locked" color="flat" class="htw:h-auto htw:p-0 htw:text-xs" @click="$emit('select', index)">
          {{ label }}
        </HstButton>
        <span v-else>{{ label }}</span>
      </li>
    </ol>
  </nav>
</template>
