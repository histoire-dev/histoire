<script lang="ts">
export default { name: 'HstTokenVirtualRows' }
</script>

<script lang="ts" setup>
import type { ProcessedToken } from './tokens'
import { computed, ref } from 'vue'
import { useTokenVirtualRows } from './useTokenVirtualRows'

const props = withDefaults(defineProps<{
  /** Ordered tokens already processed by the public grid/list component. */
  tokens: readonly ProcessedToken[]
  /** Grid rows reflow by measured canvas width; list rows remain one token each. */
  layout: 'grid' | 'list'
  /** Grid column width, matching HstTokenGrid's existing option. */
  colSize?: number
  /** Approximate row size used until browser measurement arrives. */
  estimatedRowSize?: number
  /** Number of extra measured rows retained around native viewport. */
  overscan?: number
  /** Controls appearance inherited by copy actions and samples. */
  dark?: boolean
}>(), {
  colSize: 180,
  estimatedRowSize: undefined,
  overscan: 3,
})

const container = ref<HTMLElement>()
const { columns, rows, rendered, getRowElementRef, retainFocusedToken, releaseFocusedToken } = useTokenVirtualRows({
  container,
  tokens: computed(() => props.tokens),
  layout: computed(() => props.layout),
  colSize: computed(() => props.colSize),
  estimatedRowSize: computed(() => props.estimatedRowSize),
  overscan: computed(() => props.overscan),
})
</script>

<template>
  <div
    ref="container"
    data-token-virtual-root
    v-bind="$attrs"
    class="histoire-token-virtual" :class="[`histoire-token-virtual-${layout}`]"
    :data-histoire-control-appearance="dark ? 'dark' : 'light'"
    @focusin="retainFocusedToken"
    @focusout="releaseFocusedToken"
  >
    <div v-if="rendered.offsetTop > 0" aria-hidden="true" data-token-virtual-spacer="top" class="histoire-token-virtual-spacer" :style="{ height: `${rendered.offsetTop}px` }" />
    <template v-for="entry of rendered.entries" :key="entry.row.key">
      <div v-if="entry.offsetBefore > 0" aria-hidden="true" data-token-virtual-spacer="gap" class="histoire-token-virtual-spacer" :style="{ height: `${entry.offsetBefore}px` }" />
      <div
        :ref="getRowElementRef(entry.row.key)"
        :data-token-virtual-row="entry.row.key"
        class="histoire-token-virtual-row"
        :class="`histoire-token-virtual-row-${layout}`"
        :style="{
          gridTemplateColumns: layout === 'grid' ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
          paddingBottom: entry.index < rows.length - 1 ? `${layout === 'grid' ? 16 : 32}px` : undefined,
        }"
      >
        <div v-for="token of entry.row.tokens" :key="token.key" :data-token-virtual-key="token.key" class="histoire-token-virtual-cell">
          <slot :token="token" />
        </div>
      </div>
    </template>
    <div v-if="rendered.offsetBottom > 0" aria-hidden="true" data-token-virtual-spacer="bottom" class="histoire-token-virtual-spacer" :style="{ height: `${rendered.offsetBottom}px` }" />
  </div>
</template>

<style>
.histoire-token-virtual { box-sizing: border-box; min-width: 0; }
.histoire-token-virtual-row { box-sizing: border-box; min-width: 0; }
.histoire-token-virtual-row-grid { display: grid; gap: 16px; }
.histoire-token-virtual-cell { min-width: 0; }
.histoire-token-virtual-spacer { display: block; width: 100%; pointer-events: none; }
</style>
