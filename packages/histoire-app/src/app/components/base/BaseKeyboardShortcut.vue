<script lang="ts" setup>
import { formatKey } from '../../util/keyboard.js'
import { computed } from 'vue'

const props = defineProps<{
  shortcut: string
}>()

const formatted = computed(() => props.shortcut.split('+').map(k => formatKey(k.trim())).join(' '))
</script>

<template>
  <span class="histoire-base-keyboard-shortcut htw-border htw-border-current htw-opacity-50 htw-px-1 htw-rounded-sm">
    {{ formatted }}
  </span>
</template>
