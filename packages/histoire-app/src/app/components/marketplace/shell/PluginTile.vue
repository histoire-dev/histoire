<script setup lang="ts">
import type { CatalogEntry } from '@histoire/shared'
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** Public catalog identity and bundled visual metadata. */ plugin: Pick<CatalogEntry, 'displayName' | 'logoUrl' | 'monogram' | 'tint'>
  /** Supported tile edge lengths in pixels. */ size?: 34 | 36 | 40 | 48 | 64
}>(), { size: 48 })
const failed = ref(false)
watch(() => props.plugin.logoUrl, () => {
  failed.value = false
})
/**
 * Bundled official logos are monochrome SVG data URIs (community manifests only allow https),
 * drawn as a mask so they take the tint color in both themes. JSON quoting keeps one CSS string.
 */
const mask = computed(() => props.plugin.logoUrl?.startsWith('data:image/svg+xml') ? { '--plugin-logo': `url(${JSON.stringify(props.plugin.logoUrl)})` } : undefined)
/** Fixed utility names remain discoverable by Tailwind without runtime CSS. */
const tints = {
  green: 'htw:bg-emerald-500/10 htw:text-emerald-600 htw:dark:text-emerald-300',
  violet: 'htw:bg-violet-500/10 htw:text-violet-600 htw:dark:text-violet-300',
  blue: 'htw:bg-blue-500/10 htw:text-blue-600 htw:dark:text-blue-300',
  amber: 'htw:bg-amber-500/10 htw:text-amber-700 htw:dark:text-amber-300',
  rose: 'htw:bg-rose-500/10 htw:text-rose-600 htw:dark:text-rose-300',
  sky: 'htw:bg-sky-500/10 htw:text-sky-600 htw:dark:text-sky-300',
  slate: 'htw:bg-slate-500/10 htw:text-slate-600 htw:dark:text-slate-300',
} satisfies Record<CatalogEntry['tint'], string>
/** Keep every supported size in the static utility scan. */
const sizes = {
  /** Collection card. */ 34: 'htw:size-[34px]',
  /** Installed settings row. */ 36: 'htw:size-[36px]',
  /** Catalog row and update header. */ 40: 'htw:size-[40px]',
  /** Discover hero. */ 48: 'htw:size-[48px]',
  /** Detail header. */ 64: 'htw:size-[64px]',
}
</script>

<template>
  <span aria-hidden="true" class="htw:inline-flex htw:shrink-0 htw:items-center htw:justify-center htw:overflow-hidden htw:font-mono htw:font-semibold" :class="[tints[plugin.tint], sizes[size], size === 64 ? 'htw:rounded-[14px]' : 'htw:rounded-[10px]']">
    <span v-if="mask" class="htw:size-[56%] htw:bg-current htw:[mask:var(--plugin-logo)_center/contain_no-repeat]" :style="mask" />
    <img v-else-if="plugin.logoUrl && !failed" :src="plugin.logoUrl" alt="" class="htw:size-full htw:object-contain" @error="failed = true">
    <span v-else>{{ plugin.monogram }}</span>
  </span>
</template>
