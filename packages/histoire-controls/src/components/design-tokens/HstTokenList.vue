<script lang="ts">
export default { name: 'HstTokenList' }
</script>

<script lang="ts" setup>
import { computed } from 'vue'
import { useControlsTheme } from '../../utils'
import HstTokenDetails from './HstTokenDetails.vue'
import HstTokenVirtualRows from './HstTokenVirtualRows.vue'
import { processTokens } from './tokens'

const dark = useControlsTheme()
const props = defineProps<{
  /** Token values, preserving original slot payloads. */
  tokens: Record<string, string | number | any[] | Record<string, any>>
  /** Optional utility or token name formatter. */
  getName?: (key: string, value: any) => string
  /** Literal search across displayed names and values. */
  search?: string
  /** Render a bounded native-document window for large generated token sets. */
  virtualize?: boolean
}>()
/** Filter without changing original value shapes. */
const processedTokens = computed(() => processTokens(props.tokens, props.getName, props.search))
</script>

<template>
  <slot v-if="!processedTokens.length" name="empty" />
  <HstTokenVirtualRows
    v-else-if="virtualize"
    :tokens="processedTokens"
    :dark="dark"
    layout="list"
    class="histoire-token-list htw-my-8"
  >
    <template #default="{ token }">
      <div class="htw-flex htw-flex-col htw-gap-2">
        <slot :token="token" />
        <HstTokenDetails :name="token.name" :value="token.value" class="htw-mx-4" />
      </div>
    </template>
  </HstTokenVirtualRows>
  <div v-for="token of processedTokens" v-else :key="token.key" :data-histoire-control-appearance="dark ? 'dark' : 'light'" class="histoire-token-list htw-flex htw-flex-col htw-gap-2 htw-my-8">
    <slot :token="token" />
    <HstTokenDetails :name="token.name" :value="token.value" class="htw-mx-4" />
  </div>
</template>
