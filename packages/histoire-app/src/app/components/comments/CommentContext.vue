<script setup lang="ts">
import type { UiComment, UiCommentDraft } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

defineProps<{
  /** Human-readable story and variant. */
  title: string
  /** Persisted or composer context. */
  comment: UiComment | UiCommentDraft
  /** Show a control collapsing the card back to its pin. */
  minimizable?: boolean
}>()
const emit = defineEmits<{
  /** Collapse card back to its pin. */
  minimize: []
}>()
</script>

<template>
  <header class="comment-context" :class="{ minimizable }">
    <span><BuiltinIcon icon="cube" :size="16" />{{ title }}</span>
    <code v-if="comment.anchor.selector"><BuiltinIcon icon="code" :size="16" />{{ comment.anchor.selector }}</code>
    <span v-if="comment.props && Object.keys(comment.props).length"><BuiltinIcon icon="settings-adjust" :size="16" />{{ Object.keys(comment.props).length }} props</span>
    <span v-if="comment.screenshot" :title="comment.screenshot"><BuiltinIcon icon="camera" :size="16" />screenshot</span>
    <HstButton v-if="minimizable" icon-only color="flat" type="button" class="minimize" aria-label="Minimize comment" title="Minimize" @click="emit('minimize')">
      <BuiltinIcon icon="subtract" :size="16" />
    </HstButton>
  </header>
</template>

<style scoped>
.comment-context { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 12px 14px; border-bottom: 1px solid var(--histoire-border); }
.comment-context span, .comment-context code { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; padding: 5px 8px; border-radius: 6px; background: var(--histoire-chip); color: var(--histoire-body); font-size: 11px; overflow-wrap: anywhere; }
.comment-context.minimizable { padding-right: 44px; }
.comment-context .minimize { --histoire-icon-button-size: 24px; position: absolute; top: 12px; right: 12px; color: var(--histoire-muted); }
.comment-context svg { color: var(--histoire-muted); width: 13px; height: 13px; }
</style>
