<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps<{
  complexParameter: Array<{action: () => void}>
}>()
</script>

<template>
  <div
    class="native-story"
    @click="complexParameter[0].action"
  >
    Custom click
  </div>
</template>
