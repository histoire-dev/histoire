<script lang="ts" setup>
import { useResizeObserver } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useStoryStore } from '../../stores/story'
import StoryVariantGridItem from './StoryVariantGridItem.vue'

const storyStore = useStoryStore()

const gridTemplateWidth = computed(() => {
  if (storyStore.currentStory.layout.type !== 'grid') {
    return
  }

  const layoutWidth = storyStore.currentStory.layout.width

  if (!layoutWidth) {
    return '200px'
  }

  if (typeof layoutWidth === 'number') {
    return layoutWidth + 'px'
  }

  return layoutWidth
})

const margin = 16
const gap = 16

const itemWidth = ref(16)
const maxItemHeight = ref(0)
const maxCount = ref(10)
const countPerRow = ref(0)
const visibleRows = ref(0)

const el = ref<HTMLDivElement>(null)

useResizeObserver(el, () => {
  updateMaxCount()
})

function updateMaxCount () {
  if (!maxItemHeight.value) return

  const width = el.value!.clientWidth - margin * 2
  const height = el.value!.clientHeight
  const scrollTop = el.value!.scrollTop

  // width = (countPerRow - 1) * gap + countPerRow * itemWidth.value

  // W = (C - 1) * G + C * I
  // W = C * G - G + C * I
  // W + G = C * G + C * I
  // W + G = C * (G + I)
  // (W + G) / (G + I) = C

  countPerRow.value = Math.floor((width + gap) / (itemWidth.value + gap))
  visibleRows.value = Math.ceil((height + scrollTop + gap) / (maxItemHeight.value + gap))
  const newMaxCount = countPerRow.value * visibleRows.value
  if (maxCount.value < newMaxCount) {
    maxCount.value = newMaxCount
  }

  if (storyStore.currentVariant) {
    const index = storyStore.currentStory.variants.indexOf(storyStore.currentVariant)
    if (index + 1 > maxCount.value) {
      maxCount.value = index + 1
    }
  }
}

function onItemResize (w: number, h: number) {
  itemWidth.value = w
  if (maxItemHeight.value < h) {
    maxItemHeight.value = h
    updateMaxCount()
  }
}

watch(() => storyStore.currentVariant, () => {
  updateMaxCount()
})
</script>

<template>
  <div
    ref="el"
    class="htw-h-full htw-overflow-y-auto"
    @scroll="updateMaxCount()"
  >
    <div
      :style="{
        minHeight: `${(storyStore.currentStory.variants.length / countPerRow) * (maxItemHeight + gap) - gap}px`,
      }"
    >
      <div
        class="htw-grid htw-gap-4 htw-m-4"
        :style="{
          gridTemplateColumns: `repeat(auto-fill, ${gridTemplateWidth})`,
        }"
      >
        <StoryVariantGridItem
          v-for="(variant, index) of storyStore.currentStory.variants.slice(0, maxCount)"
          :key="index"
          :variant="variant"
          :story="storyStore.currentStory"
          @resize="onItemResize"
        />
      </div>
    </div>
  </div>
</template>
