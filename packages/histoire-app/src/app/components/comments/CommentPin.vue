<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'

defineProps<{
  /** Stable visible annotation ordinal. */
  number?: number
  /** Current draft/status needs user attention. */
  active?: boolean
  /** Unsent comments use neutral styling. */
  draft?: boolean
  /** Unsaved picked point uses the active compose-board plus cue. */
  temporary?: boolean
}>()
const emit = defineEmits<{
  /** Reveal this annotation's thread. */
  select: []
}>()
</script>

<template>
  <HstButton color="flat" type="button" class="comment-pin" :class="{ active, draft }" :aria-label="temporary ? 'Current comment draft' : `Open comment ${number}`" :aria-pressed="active" @click.stop="emit('select')">
    <WorkbenchIcon v-if="temporary" name="add" :size="14" />
    <template v-else>
      {{ number }}
    </template>
  </HstButton>
</template>

<style scoped>
.comment-pin { display: grid; place-items: center; width: 27px; height: 29px; padding: 0; color: #fff; }
.comment-pin.draft { background: var(--histoire-muted); }
.comment-pin.active { outline: 3px solid rgb(var(--histoire-agent-rgb) / .25); outline-offset: 2px; }
.comment-pin:focus-visible { outline: 2px solid var(--histoire-agent); outline-offset: 3px; }
</style>
