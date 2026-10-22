<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { ref, watch } from 'vue'
import { useCanvasStore } from '../../composables/canvas-settings.js'

const canvas = useCanvasStore()
const pathElement = ref<HTMLElement>()

// Long breadcrumbs scroll; keep the measured element (last entry) in view.
watch(() => canvas.measure?.path, () => {
  pathElement.value?.scrollTo({ left: pathElement.value.scrollWidth })
}, { flush: 'post' })

/** Ancestor levels between the locked element and breadcrumb entry `index`. */
function depth(index: number): number {
  return (canvas.measure?.path.length ?? 0) - 1 - index
}
</script>

<template>
  <div class="histoire-measure-toolbar" role="toolbar" aria-label="Locked measurement">
    <nav v-if="canvas.measure?.path.length" ref="pathElement" class="measure-path" aria-label="Measured element">
      <template v-for="(label, index) in canvas.measure.path" :key="index">
        <BuiltinIcon v-if="index" icon="chevron-right" :size="12" class="measure-path-separator" />
        <HstButton v-if="depth(index)" color="flat" @click="canvas.measure?.navigate('parent', depth(index))">
          {{ label }}
        </HstButton>
        <strong v-else aria-current="location">{{ label }}</strong>
      </template>
    </nav>
    <div class="measure-actions">
      <HstButton color="flat" aria-pressed="true" title="Unlock measurement" @click="canvas.measure?.unlock()">
        <BuiltinIcon icon="locked" :size="14" />Locked
      </HstButton>
      <HstButton color="flat" @click="canvas.measure?.navigate('parent')">
        <BuiltinIcon icon="arrow-up" :size="14" />Parent
      </HstButton>
      <HstButton color="flat" @click="canvas.measure?.navigate('child')">
        <BuiltinIcon icon="arrow-down" :size="14" />First child
      </HstButton>
      <HstButton color="flat" :disabled="!canvas.measure?.siblings" @click="canvas.measure?.navigate('previous')">
        <BuiltinIcon icon="chevron-left" :size="14" />Previous
      </HstButton>
      <HstButton color="flat" :disabled="!canvas.measure?.siblings" @click="canvas.measure?.navigate('next')">
        Next<BuiltinIcon icon="chevron-right" :size="14" />
      </HstButton>
      <span class="canvas-hint-item measure-compare"><kbd>⇧</kbd> + hover compare</span>
    </div>
  </div>
</template>

<style scoped>
/* Element selector outranks the shared hint row layout applied by CanvasStatus; padding, kbd and item styles come from there. */
div.histoire-measure-toolbar { flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 4px; pointer-events: auto; }
.measure-path { display: flex; flex: none; align-items: center; gap: 2px; min-width: 0; padding-inline: 4px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; font: 11px var(--histoire-font-mono, "JetBrains Mono", monospace); }
.measure-path > * { flex: none; }
/* Breadcrumb entries share one 20px box whether clickable or current. */
.measure-path > :is(.histoire-button, strong) { display: inline-flex; align-items: center; box-sizing: border-box; height: 20px; padding: 0 4px; border: 1px solid transparent; border-radius: 4px; line-height: 14px; }
.measure-path strong { color: var(--histoire-text); font-weight: 600; }
.measure-path .histoire-button { font: inherit; color: var(--histoire-muted); }
.measure-path-separator { color: var(--histoire-muted); }
.measure-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
/* Same 24px box as the shared hint entries in CanvasStatus. */
.measure-actions .histoire-button { box-sizing: border-box; height: 24px; gap: 4px; padding: 0 7px; border-radius: 6px; font-size: 12px; line-height: 16px; }
@container (max-width: 650px) { .measure-compare { display: none; } }
</style>
