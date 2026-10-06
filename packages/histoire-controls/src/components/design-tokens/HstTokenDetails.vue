<script setup lang="ts">
import { computed } from 'vue'
import { VTooltip as vTooltip } from '../../overlay/tooltip'
import HstCopyIcon from '../HstCopyIcon.vue'
import { formatTokenValue } from './tokens'

const props = withDefaults(defineProps<{
  /** Exact token name copied by first action. */
  name: string
  /** Original token value, including tuples and objects. */
  value: unknown
  /** Label namespace for accessible copy actions. */
  kind?: string
  /** Approximate visible character count before tooltip becomes useful. */
  maxCharacters?: number
}>(), { kind: 'token', maxCharacters: 23 })

/** Shared display and clipboard representation. */
const formatted = computed(() => formatTokenValue(props.value))
</script>

<template>
  <div class="htw-min-w-0">
    <div class="htw-flex htw-items-center htw-gap-1">
      <pre v-tooltip="name.length > maxCharacters ? name : ''" class="htw-my-0 htw-truncate htw-shrink">{{ name }}</pre>
      <HstCopyIcon :content="name" :label="`Copy ${kind} name`" class="htw-flex-none" />
    </div>
    <div class="htw-flex htw-items-center htw-gap-1">
      <pre v-tooltip="formatted.length > maxCharacters ? formatted : ''" class="htw-my-0 htw-opacity-50 htw-truncate htw-shrink">{{ formatted }}</pre>
      <HstCopyIcon :content="formatted" :label="`Copy ${kind} value`" class="htw-flex-none" />
    </div>
  </div>
</template>
