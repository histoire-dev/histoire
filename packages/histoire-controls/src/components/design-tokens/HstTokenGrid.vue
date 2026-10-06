<script lang="ts">
export default { name: 'HstTokenGrid' }
</script>

<script lang="ts" setup>
import { computed } from 'vue'
import { useControlsTheme } from '../../utils'
import HstTokenDetails from './HstTokenDetails.vue'
import { processTokens } from './tokens'

const dark = useControlsTheme()
const props = withDefaults(defineProps<{
  /** Token values, preserving original slot payloads. */
  tokens: Record<string, string | number | any[] | Record<string, any>>
  /** Desired grid column width in pixels. */
  colSize?: number
  /** Optional utility or token name formatter. */
  getName?: (key: string, value: any) => string
  /** Literal search across displayed names and values. */
  search?: string
}>(), { colSize: 180 })
/** Filter without assuming values have string length. */
const processedTokens = computed(() => processTokens(props.tokens, props.getName, props.search))
const colSizePx = computed(() => `${props.colSize}px`)
</script>

<template>
  <slot v-if="!processedTokens.length" name="empty" />
  <div :data-histoire-control-appearance="dark ? 'dark' : 'light'" class="histoire-token-grid htw-bind-col-size htw-grid htw-gap-4 htw-m-4" :style="{ '--histoire-col-size': colSizePx }">
    <div v-for="token of processedTokens" :key="token.key" class="htw-flex htw-flex-col htw-gap-2 htw-min-w-0">
      <slot :token="token" />
      <HstTokenDetails :name="token.name" :value="token.value" :max-characters="colSize / 8" />
    </div>
  </div>
</template>

<style>
.htw-bind-col-size { grid-template-columns: repeat(auto-fill, minmax(min(var(--histoire-col-size), 100%), 1fr)); }
</style>
