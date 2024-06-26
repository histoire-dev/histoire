<script lang="ts" setup>
import { useResizeObserver } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import type { Story, Variant } from '../../types.js'
import StoryVariantGridItem from './StoryVariantGridItem.vue'

const props = defineProps<{
  story: Story
  variant?: Variant
}>()

const emit = defineEmits<{
  select: [variantId: string]
  ready: [variantId: string]
}>()

const gap = 16

const el = ref<HTMLDivElement>(null)

// Grid size

const gridTemplateWidth = computed(() => {
  if (props.story.layout.type !== 'grid') {
    return
  }

  const layoutWidth = props.story.layout.width

  if (!layoutWidth) {
    return '200px'
  }

  if (typeof layoutWidth === 'number') {
    return `${layoutWidth}px`
  }

  return layoutWidth
})

const gridEl = ref<HTMLDivElement>(null)
const gridColumnWidth = ref(1)
const viewWidth = ref(1)

const columnCount = computed(() => Math.min(props.story.variants.length, Math.floor((viewWidth.value + gap) / (gridColumnWidth.value + gap * 2))))

function updateSize() {
  if (!el.value) return
  viewWidth.value = el.value.clientWidth

  if (!gridEl.value) return

  if (gridTemplateWidth.value.endsWith('%')) {
    gridColumnWidth.value = viewWidth.value * Number.parseInt(gridTemplateWidth.value) / 100 - gap
  }
  else {
    gridColumnWidth.value = Number.parseInt(gridTemplateWidth.value)
  }
}

onMounted(() => {
  updateSize()
})

useResizeObserver(gridEl, () => {
  updateSize()
})

// Visible items

const itemWidth = ref(16)
const maxItemHeight = ref(0)
const maxCount = ref(10)
const visibleRows = ref(0)

useResizeObserver(el, () => {
  updateMaxCount()
  updateSize()
})

function updateMaxCount() {
  if (!maxItemHeight.value) return

  const height = el.value!.clientHeight
  const scrollTop = el.value!.scrollTop

  // width = (countPerRow - 1) * gap + countPerRow * itemWidth.value
  // W = (C - 1) * G + C * I
  // W = C * G - G + C * I
  // W + G = C * G + C * I
  // W + G = C * (G + I)
  // (W + G) / (G + I) = C

  visibleRows.value = Math.ceil((height + scrollTop + gap) / (maxItemHeight.value + gap))
  const newMaxCount = columnCount.value * visibleRows.value
  if (maxCount.value < newMaxCount) {
    maxCount.value = newMaxCount
  }

  if (props.variant) {
    const index = props.story.variants.indexOf(props.variant)
    if (index + 1 > maxCount.value) {
      maxCount.value = index + 1
    }
  }
}

function onItemResize(w: number, h: number) {
  itemWidth.value = w
  if (maxItemHeight.value < h) {
    maxItemHeight.value = h
    updateMaxCount()
  }
}
</script>

<template>
  <div
    ref="el"
    class="htw-overflow-y-auto htw-flex htw-h-full"
    @scroll="updateMaxCount()"
  >
    <div class="htw-flex htw-w-0 htw-flex-1 htw-mx-4">
      <div
        class="htw-m-auto"
        :style="{
          minHeight: `${(props.story.variants.length / columnCount) * (maxItemHeight + gap) - gap}px`,
        }"
      >
        <div
          ref="gridEl"
          class="htw-grid htw-gap-4 htw-my-4"
          :style="{
            gridTemplateColumns: `repeat(${columnCount}, ${gridColumnWidth}px)`,
          }"
        >
          <StoryVariantGridItem
            v-for="(v, index) of props.story.variants.slice(0, maxCount)"
            :key="index"
            :variant="v"
            :story="props.story"
            :estimated-height="maxItemHeight"
            :selected="v === variant"
            @resize="onItemResize"
            @select="emit('select', v.id)"
            @ready="emit('ready', v.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
