<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps<{
  complexParameter: Array<{action: () => void}>
  recursiveParameter: {name: string} & Record<string, unknown>
}>()
</script>

<template>
  <div
    class="native-story"
    @click="complexParameter[0].action"
  >
    Custom click
  </div>
  <div>
    {{ recursiveParameter.name }}
  </div>
</template>

<style scoped>
.native-story{
  color: var(--contrast-color)
}
</style>
