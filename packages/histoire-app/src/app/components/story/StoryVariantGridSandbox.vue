<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import { useResizeObserver } from '@vueuse/core'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import StoryVariantGridSandboxItem from './StoryVariantGridSandboxItem.vue'
import { VirtualGridGeometry } from './virtual-grid.js'

const props = defineProps<{
  story: Story
  variant?: Variant
  /** Actor admissions supplied by owned runtime; absent for legacy direct consumers. */
  readyVariantIds?: ReadonlySet<string>
}>()

const emit = defineEmits<{
  ready: [variantId: string]
  select: [variantId: string]
}>()

const gap = 16
const padding = 16
const initialRowHeight = 320
const el = ref<HTMLDivElement>()
const viewWidth = ref(1)
const viewHeight = ref(0)
const scrollTop = ref(0)
const geometry = shallowRef(new VirtualGridGeometry(props.story.variants.length, 1, gap, initialRowHeight))
const geometryVersion = ref(0)
const variantHeights = new Map<string, number>()

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

const gridColumnWidth = computed(() => {
  if (gridTemplateWidth.value.endsWith('%')) {
    return viewWidth.value * Number.parseInt(gridTemplateWidth.value) / 100 - gap
  }

  return Number.parseInt(gridTemplateWidth.value)
})

const columnCount = computed(() => {
  const count = Math.floor((viewWidth.value + gap) / (gridColumnWidth.value + gap * 2))
  return Math.max(1, Math.min(props.story.variants.length, count))
})

const variantIndexes = computed(() => new Map(props.story.variants.map((variant, index) => [variant.id, index])))
const selectedIndex = computed(() => props.variant ? variantIndexes.value.get(props.variant.id) ?? -1 : -1)
const currentGeometry = computed(() => ({ geometry: geometry.value, revision: geometryVersion.value }))
const canvasTop = computed(() => Math.max(0, (viewHeight.value - currentGeometry.value.geometry.totalHeight - padding * 2) / 2))
const canvasHeight = computed(() => currentGeometry.value.geometry.totalHeight + padding * 2)

const visibleRows = computed(() => {
  const current = currentGeometry.value.geometry
  const viewportTop = scrollTop.value - canvasTop.value - padding
  const range = current.visibleRange(viewportTop, viewHeight.value)
  const rows = []

  for (let rowIndex = range.start; rowIndex < range.end; rowIndex++) {
    const start = rowIndex * columnCount.value
    rows.push({
      index: rowIndex,
      top: current.rowTop(rowIndex),
      variants: props.story.variants.slice(start, start + columnCount.value),
    })
  }

  return rows
})

/** Captures the first visible row position while measured heights adjust offsets. */
function captureScrollAnchor(): { rowIndex: number, offset: number } | undefined {
  const current = currentGeometry.value.geometry
  if (!el.value || !current.rowCount) return

  const viewportTop = scrollTop.value - canvasTop.value - padding
  const range = current.visibleRange(viewportTop, viewHeight.value)
  const rowIndex = Math.min(range.start, current.rowCount - 1)
  return {
    rowIndex,
    offset: scrollTop.value - canvasTop.value - padding - current.rowTop(rowIndex),
  }
}

/** Restores captured row position after an estimate or measurement changes. */
function restoreScrollAnchor(anchor: { rowIndex: number, offset: number } | undefined): void {
  if (!anchor || !el.value) return

  const current = currentGeometry.value.geometry
  const top = Math.max(0, canvasTop.value + padding + current.rowTop(anchor.rowIndex) + anchor.offset)
  el.value.scrollTop = top
  scrollTop.value = el.value.scrollTop
}

/** Resolves exact row height once every variant in that row has reported size. */
function measureRow(rowIndex: number): void {
  const start = rowIndex * columnCount.value
  const variants = props.story.variants.slice(start, start + columnCount.value)
  if (!variants.length) return

  let height = 0
  for (const variant of variants) {
    const measuredHeight = variantHeights.get(variant.id)
    if (measuredHeight === undefined) return
    height = Math.max(height, measuredHeight)
  }

  geometry.value.setRowHeight(rowIndex, height)
}

/** Records variant size and updates sparse row offsets without losing scroll position. */
function onItemResize(variantId: string, _width: number, height: number): void {
  const index = variantIndexes.value.get(variantId)
  if (index === undefined || !Number.isFinite(height) || height <= 0) return
  if (variantHeights.get(variantId) === height) return

  const anchor = captureScrollAnchor()
  variantHeights.set(variantId, height)
  if (height > geometry.value.estimatedRowHeight) {
    geometry.value.setEstimatedRowHeight(height)
  }
  measureRow(Math.floor(index / columnCount.value))
  geometryVersion.value++
  restoreScrollAnchor(anchor)
}

/** Updates computed viewport geometry from the actual scroll container. */
function updateViewport(): void {
  if (!el.value) return
  viewWidth.value = el.value.clientWidth
  viewHeight.value = el.value.clientHeight
  scrollTop.value = el.value.scrollTop
}

/** Mirrors user scrolling into the exact virtual row range. */
function onScroll(): void {
  if (el.value) scrollTop.value = el.value.scrollTop
}

/** Scrolls selected row into view before it is mounted in the virtual window. */
function scrollSelectedVariantIntoView(): void {
  if (!el.value || selectedIndex.value < 0) return

  const current = currentGeometry.value.geometry
  const rowIndex = Math.floor(selectedIndex.value / columnCount.value)
  const rowTop = canvasTop.value + padding + current.rowTop(rowIndex)
  const rowBottom = rowTop + current.rowHeight(rowIndex)
  const viewportTop = el.value.scrollTop
  const viewportBottom = viewportTop + el.value.clientHeight
  if (rowTop >= viewportTop && rowBottom <= viewportBottom) return

  el.value.scrollTop = Math.max(0, rowTop - Math.max(0, (el.value.clientHeight - current.rowHeight(rowIndex)) / 2))
  scrollTop.value = el.value.scrollTop
}

/** Clears layout-specific measurements after story, width, or column changes. */
function resetGeometry(): void {
  variantHeights.clear()
  geometry.value = new VirtualGridGeometry(props.story.variants.length, columnCount.value, gap, initialRowHeight)
  geometryVersion.value++
}

watch(() => [props.story.id, variantIndexes.value, columnCount.value, gridColumnWidth.value], resetGeometry)
watch([selectedIndex, columnCount, gridColumnWidth], scrollSelectedVariantIntoView, { flush: 'post' })

useResizeObserver(el, updateViewport)

onMounted(() => {
  updateViewport()
  scrollSelectedVariantIntoView()
})
</script>

<template>
  <div
    ref="el"
    class="htw-overflow-y-auto htw-flex htw-h-full"
    @scroll="onScroll"
  >
    <div class="htw-flex htw-w-0 htw-flex-1 htw-mx-4">
      <div
        class="htw-relative htw-my-auto htw-flex-none htw-w-full"
        :style="{ height: `${canvasHeight}px` }"
      >
        <div
          v-for="row of visibleRows"
          :key="row.index"
          class="htw-absolute htw-grid htw-gap-4"
          :data-histoire-grid-row="row.index"
          :style="{
            top: `${padding + row.top}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            gridTemplateColumns: `repeat(${columnCount}, ${gridColumnWidth}px)`,
          }"
        >
          <StoryVariantGridSandboxItem
            v-for="gridVariant of row.variants"
            :key="gridVariant.id"
            :story="story"
            :variant="gridVariant"
            :selected="gridVariant.id === variant?.id"
            :ready="readyVariantIds?.has(gridVariant.id) ?? true"
            @resize="(width, height) => onItemResize(gridVariant.id, width, height)"
            @select="emit('select', gridVariant.id)"
            @ready="emit('ready', gridVariant.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
