<script lang="ts">
export default { name: 'HstColorShades' }
</script>

<script lang="ts" setup>
import type { CSSProperties } from 'vue'
import { computed } from 'vue'
import { useControlsTheme } from '../../utils'
import HstTokenDetails from './HstTokenDetails.vue'
import { flattenTokenShades, matchesToken } from './tokens'

const dark = useControlsTheme()
const props = defineProps<{
  /** Nested color groups and DEFAULT leaves. */
  shades: Record<string, any>
  /** Optional utility or color name formatter. */
  getName?: (key: string, color: string) => string
  /** Literal search across names and colors. */
  search?: string
}>()
/** Preserve original colors while flattening nested names. */
const displayedShades = computed(() => Object.entries(flattenTokenShades(props.shades)).map(([key, color]) => ({ key, color, name: props.getName ? props.getName(key, color) : key })).filter(shade => matchesToken(shade.name, shade.color, props.search)))
</script>

<template>
  <slot v-if="!displayedShades.length" name="empty" />
  <div v-if="displayedShades.length" :data-histoire-control-appearance="dark ? 'dark' : 'light'" class="histoire-color-shades htw-grid htw-gap-4 htw-grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] htw-m-4">
    <div v-for="shade of displayedShades" :key="shade.key" class="htw-flex htw-flex-col htw-gap-2 htw-min-w-0">
      <slot :color="shade.color">
        <div class="htw-rounded-full htw-w-16 htw-h-16" :style="{ backgroundColor: shade.color } as CSSProperties" />
      </slot>
      <HstTokenDetails :name="shade.name" :value="shade.color" kind="color" />
    </div>
  </div>
</template>
