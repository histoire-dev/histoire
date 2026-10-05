<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { computed, useAttrs, useId } from 'vue'
import { useOverflowToolbar } from '../../base/overflow/context.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

/** Uniform canvas control with native button semantics. */
const props = withDefaults(defineProps<{
  /** Accessible action name and visible dropdown label. */
  label: string
  /** Optional Carbon glyph. */
  icon?: string
  /** Toggle or exclusive-choice selection state. */
  pressed?: boolean
  /** Native disabled state. */
  disabled?: boolean
  /** Shortcut metadata, visible in dropdown. */
  shortcut?: string
  /** Additional disabled reason without expanding action label. */
  description?: string
  /** Exclusive choices opt into radio semantics in dropdown. */
  menuRole?: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio'
}>(), { pressed: undefined })
const attrs = useAttrs()
const { toolbar, overflow } = useOverflowToolbar()
const descriptionId = useId()
const role = computed(() => overflow?.value ? props.menuRole ?? (props.pressed === undefined ? 'menuitem' : 'menuitemcheckbox') : undefined)

/** Ordinary actions dismiss dropdown; panel triggers keep parent available. */
function click(): void {
  if (overflow?.value && !attrs['aria-haspopup']) toolbar?.close(true)
}
</script>

<template>
  <HstButton color="flat" type="button" class="histoire-toolbar-button" :role="role" :tabindex="overflow ? -1 : undefined" :aria-label="label" :title="description ?? (shortcut ? `${label} (${shortcut})` : label)" :aria-describedby="description ? descriptionId : undefined" :aria-pressed="role || pressed === undefined ? undefined : pressed" :aria-checked="role && role !== 'menuitem' ? pressed : undefined" :disabled="disabled" @click="click">
    <WorkbenchIcon v-if="icon" :name="icon" />
    <span class="toolbar-action-label">{{ label }}</span>
    <span v-if="$slots.default" class="toolbar-action-value"><slot /></span>
    <span v-if="shortcut" class="toolbar-action-shortcut">{{ shortcut }}</span>
    <span v-if="description" :id="descriptionId" class="toolbar-action-description">{{ description }}</span>
  </HstButton>
</template>

<style scoped>
.histoire-toolbar-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 28px; height: 28px; padding: 0 5px; color: var(--histoire-muted); white-space: nowrap; }
.histoire-toolbar-button :deep(svg) { display: block; width: 16px; height: 16px; flex: none; }
.toolbar-action-label, .toolbar-action-shortcut { display: none; }
.toolbar-action-value { display: contents; }
.toolbar-action-shortcut { color: var(--histoire-muted); font: 11px var(--histoire-font-mono); }
.toolbar-action-description { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
