<script lang="ts" setup>
import { computed } from 'vue'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'

const props = defineProps<{
  icon: string
}>()

const isUrl = computed(() => props.icon.startsWith('http') || props.icon.startsWith('data:image')
  || props.icon.startsWith('.') || props.icon.startsWith('/'))
</script>

<template>
  <img
    v-if="isUrl"
    :src="icon"
    :alt="icon"
    class="histoire-base-icon"
  >
  <WorkbenchIcon
    v-else
    :name="icon"
    class="histoire-base-icon"
  />
</template>

<style scoped>
img.colorize-black {
  filter: grayscale(100) brightness(0);
}
</style>
