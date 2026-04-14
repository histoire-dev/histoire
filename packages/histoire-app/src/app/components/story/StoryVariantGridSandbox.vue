<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import { useResizeObserver } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import StoryVariantGridSandboxItem from './StoryVariantGridSandboxItem.vue'

const props = defineProps<{
  story: Story
  variant?: Variant
}>()

const emit = defineEmits<{
  ready: [variantId: string]
  select: [variantId: string]
}>()

const gap = 16
const el = ref<HTMLDivElement>()
const gridEl = ref<HTMLDivElement>()
const itemHeight = ref(0)
const maxCount = ref(10)
const visibleRows = ref(0)
const gridColumnWidth = ref(1)
const viewWidth = ref(1)

const gridTemplateWidth = computed(() => {
  if (props.story.layout.type !== 'grid') {
    return '200px'
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

const columnCount = computed(() => {
  const count = Math.floor((viewWidth.value + gap) / (gridColumnWidth.value + gap * 2))
  return Math.max(1, Math.min(props.story.variants.length, count))
})

const visibleVariants = computed(() => props.story.variants.slice(0, maxCount.value))

const minHeight = computed(() => {
  if (!columnCount.value || !itemHeight.value) {
    return undefined
  }

  return `${Math.ceil(props.story.variants.length / columnCount.value) * (itemHeight.value + gap) - gap}px`
})

function updateSize() {
  if (!el.value) {
    return
  }

  viewWidth.value = el.value.clientWidth

  if (!gridEl.value) {
    return
  }

  if (gridTemplateWidth.value.endsWith('%')) {
    gridColumnWidth.value = viewWidth.value * Number.parseInt(gridTemplateWidth.value) / 100 - gap
  }
  else {
    gridColumnWidth.value = Number.parseInt(gridTemplateWidth.value)
  }
}

function updateMaxCount() {
  if (!el.value || !itemHeight.value) {
    return
  }

  const height = el.value.clientHeight
  const scrollTop = el.value.scrollTop
  visibleRows.value = Math.ceil((height + scrollTop + gap) / (itemHeight.value + gap))

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

function onItemResize(_width: number, height: number) {
  if (itemHeight.value < height) {
    itemHeight.value = height
    updateMaxCount()
  }
}

useResizeObserver(el, () => {
  updateMaxCount()
  updateSize()
})

useResizeObserver(gridEl, () => {
  updateSize()
})

onMounted(() => {
  updateSize()
})
</script>

<template>
  <div
    ref="el"
    class="htw-overflow-y-auto htw-flex htw-h-full"
    @scroll="updateMaxCount()"
  >
    <div
      class="htw-flex htw-w-0 htw-flex-1 htw-mx-4"
    >
      <div
        class="htw-m-auto"
        :style="{ minHeight }"
      >
        <div
          ref="gridEl"
          class="htw-grid htw-gap-4 htw-my-4"
          :style="{
            gridTemplateColumns: `repeat(${columnCount}, ${gridColumnWidth}px)`,
          }"
        >
          <StoryVariantGridSandboxItem
            v-for="gridVariant of visibleVariants"
            :key="gridVariant.id"
            :story="story"
            :variant="gridVariant"
            :selected="gridVariant.id === variant?.id"
            @resize="onItemResize"
            @select="emit('select', gridVariant.id)"
            @ready="emit('ready', gridVariant.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
