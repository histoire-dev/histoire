<script lang="ts">
export default { name: 'HstTokenList' }
</script>

<script lang="ts" setup>
import { computed } from 'vue'
import { useControlsTheme } from '../../utils'
import HstTokenDetails from './HstTokenDetails.vue'
import { processTokens } from './tokens'

const dark = useControlsTheme()
const props = defineProps<{
  /** Token values, preserving original slot payloads. */
  tokens: Record<string, string | number | any[] | Record<string, any>>
  /** Optional utility or token name formatter. */
  getName?: (key: string, value: any) => string
  /** Literal search across displayed names and values. */
  search?: string
}>()
/** Filter without changing original value shapes. */
const processedTokens = computed(() => processTokens(props.tokens, props.getName, props.search))
</script>

<template>
  <slot v-if="!processedTokens.length" name="empty" />
  <div v-for="token of processedTokens" :key="token.key" :data-histoire-control-appearance="dark ? 'dark' : 'light'" class="histoire-token-list htw-flex htw-flex-col htw-gap-2 htw-my-8">
    <slot :token="token" />
    <HstTokenDetails :name="token.name" :value="token.value" class="htw-mx-4" />
  </div>
</template>
