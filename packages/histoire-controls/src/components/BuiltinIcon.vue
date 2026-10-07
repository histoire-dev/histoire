<script setup lang="ts">
import { getHistoireIcon } from '@histoire/shared/dist/icons/index.js'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import './register-icons.js'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  /** Iconify identifier, bare Carbon glyph name, or supported image source. */
  icon: string
  /** Square display size in pixels or a CSS length. */
  size?: string | number
  /** Explicit width overrides `size` for the horizontal dimension. */
  width?: string | number
  /** Explicit height overrides `size` for the vertical dimension. */
  height?: string | number
}>()

/** Convert numeric shorthand to a CSS length while preserving caller strings. */
function cssDimension(value: string | number | undefined): string | undefined {
  return typeof value === 'number' ? `${value}px` : value
}

/** Match supported image source forms before trying Iconify resolution. */
const isImageSource = computed(() => props.icon.startsWith('http')
  || props.icon.startsWith('data:image')
  || props.icon.startsWith('.')
  || props.icon.startsWith('/'))

/** Resolve known glyphs and compatibility aliases from bundled data. */
const glyph = computed(() => isImageSource.value ? undefined : getHistoireIcon(props.icon))
const requestedWidth = computed(() => props.width ?? props.size)
const requestedHeight = computed(() => props.height ?? props.size)
const width = computed(() => cssDimension(requestedWidth.value ?? (glyph.value ? '1em' : undefined)))
const height = computed(() => cssDimension(requestedHeight.value ?? (glyph.value ? '1em' : undefined)))
const imageWidth = computed(() => typeof requestedWidth.value === 'number' ? requestedWidth.value : undefined)
const imageHeight = computed(() => typeof requestedHeight.value === 'number' ? requestedHeight.value : undefined)
const imageStyle = computed(() => ({
  width: typeof requestedWidth.value === 'string' ? requestedWidth.value : undefined,
  height: typeof requestedHeight.value === 'string' ? requestedHeight.value : undefined,
}))

/** Bare names remain Carbon names; namespaced identifiers keep their provider. */
const iconifyName = computed(() => props.icon.includes(':') ? props.icon : `carbon:${props.icon}`)
</script>

<template>
  <img
    v-if="isImageSource"
    v-bind="$attrs"
    :src="icon"
    :alt="icon"
    :width="imageWidth"
    :height="imageHeight"
    :style="imageStyle"
  >
  <svg
    v-else-if="glyph"
    v-bind="$attrs"
    class="iconify iconify--carbon"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${glyph.width ?? 32} ${glyph.height ?? 32}`"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    v-html="glyph.body"
  />
  <Icon
    v-else
    v-bind="$attrs"
    :icon="iconifyName"
    :width="width"
    :height="height"
    aria-hidden="true"
    focusable="false"
  />
</template>

<style scoped>
img.colorize-black { filter: grayscale(100) brightness(0); }
</style>
