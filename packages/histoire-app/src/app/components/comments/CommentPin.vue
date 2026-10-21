<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

defineProps<{
  /** Stable visible annotation ordinal. */
  number?: number
  /** Current draft/status needs user attention. */
  active?: boolean
  /** Unsent comments use neutral styling. */
  draft?: boolean
  /** Unsaved picked point uses the active compose-board plus cue. */
  temporary?: boolean
  /** Resolved annotations show a check instead of their ordinal. */
  resolved?: boolean
}>()
const emit = defineEmits<{
  /** Reveal this annotation's thread. */
  select: []
}>()
</script>

<template>
  <HstButton icon-only color="flat" type="button" class="comment-pin" :class="{ active, draft, resolved }" :aria-label="temporary ? 'Current comment draft' : `Open ${resolved ? 'resolved ' : ''}comment ${number}`" :aria-pressed="active" @click.stop="emit('select')">
    <BuiltinIcon v-if="temporary" icon="add" :size="14" />
    <BuiltinIcon v-else-if="resolved" icon="checkmark" :size="14" />
    <template v-else>
      {{ number }}
    </template>
  </HstButton>
</template>

<style scoped>
/* `.histoire-button` doubles specificity over the flat button reset (transparent background). */
.histoire-button.comment-pin { --histoire-icon-button-size: 28px; height: 30px; border-radius: 50% 50% 50% 4px; font-size: 11px; font-weight: 700; color: #fff; background: rgb(var(--histoire-agent-rgb) / .85); box-shadow: 0 1px 4px rgb(0 0 0 / .35); }
.histoire-button.comment-pin:hover, .histoire-button.comment-pin.active { background: var(--histoire-agent); }
.histoire-button.comment-pin.draft, .histoire-button.comment-pin.resolved { background: var(--histoire-muted); }
.comment-pin.active { outline: 3px solid rgb(var(--histoire-agent-rgb) / .25); outline-offset: 2px; }
.comment-pin:focus-visible { outline: 2px solid var(--histoire-agent); outline-offset: 3px; }
</style>
