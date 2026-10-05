<script setup lang="ts" generic="T extends HistoireVirtualItem">
import type { HistoireVirtualItem, HistoireVirtualListHandle } from '@histoire/vue/internal'
import { HistoireVirtualList } from '@histoire/vue/internal'
import { ref } from 'vue'
import { useWorkbenchListSizes } from '../../composables/list-density.js'

const props = defineProps<{
  /** Rows preserve exact provider-owned identity. */
  items: readonly T[]
  /** Fixed rows use known height, including mandatory one-pixel gap. */
  itemSize?: number
  /** Minimum unknown row height for dynamic content. */
  minItemSize?: number
  /** Embedded lists observe their nearest scroll parent. */
  pageMode?: boolean
  /** Native semantic list wrapper. */
  listTag?: string
  /** Native semantic item wrapper. */
  itemTag?: string
}>()
defineSlots<{ default: (value: { item: T, index: number, active: boolean }) => unknown }>()
const list = ref<HistoireVirtualListHandle>()
const sizes = useWorkbenchListSizes(() => props.itemSize, () => props.minItemSize)
/** Shared virtualization waits for distant row mount before restoring tree focus. */
async function focus(key: string): Promise<void> {
  await list.value?.focus(key)
}
/** Keep input-owned highlight visible without stealing native input focus. */
async function reveal(key: string): Promise<void> {
  await list.value?.reveal(key)
}
defineExpose({ focus, reveal })
</script>

<template>
  <HistoireVirtualList ref="list" v-bind="props" :item-size="sizes.itemSize.value" :min-item-size="sizes.minItemSize.value" :style="{ '--histoire-virtual-row-height': sizes.itemSize.value === undefined ? undefined : `${sizes.itemSize.value - 1}px` }">
    <template #default="{ index, active }">
      <slot v-if="items[index]" :item="items[index]" :index="index" :active="active" />
    </template>
  </HistoireVirtualList>
</template>
