<script setup lang="ts">
import SettingsCard from '../SettingsCard.vue'

defineProps<{
  /** Accessible group name and visible card heading. */ title: string
}>()
defineSlots<{
  /** Settings rows sharing the standard Appearance card treatment. */ default?: () => any
  /** Optional card-wide actions beside the heading. */ actions?: () => any
}>()
</script>

<template>
  <SettingsCard role="region" :aria-label="title">
    <header class="htw:flex htw:min-h-[56px] htw:box-border htw:items-center htw:justify-between htw:gap-3 htw:border-0 htw:border-b htw:border-solid htw:border-border htw:px-5 htw:py-3.5">
      <h2 class="htw:m-0 htw:text-[14px] htw:font-extrabold">
        {{ title }}
      </h2>
      <slot name="actions" />
    </header>
    <slot />
  </SettingsCard>
</template>
