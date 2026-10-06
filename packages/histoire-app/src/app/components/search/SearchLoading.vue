<script lang="ts" setup>
import { BuiltinIcon } from '@histoire/controls/vue'
</script>

<template>
  <div
    class="histoire-search-loading htw-flex htw-items-center htw-gap-4 htw-pl-6 htw-border htw-border-transparent focus-visible:htw-border-primary-500 htw-h-[51px] htw-opacity-30"
  >
    <BuiltinIcon
      icon="carbon:search"
      class="flex-none htw-w-4 htw-h-4"
    />

    Loading...
  </div>
</template>
