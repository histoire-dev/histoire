<script setup lang="ts">
import type { UiComment, UiCommentDraft } from '@histoire/shared'
import { BuiltinIcon } from '@histoire/controls/vue'

defineProps<{
  /** Human-readable story and variant. */
  title: string
  /** Persisted or composer context. */
  comment: UiComment | UiCommentDraft
}>()
</script>

<template>
  <header class="comment-context">
    <span><BuiltinIcon icon="cube" :size="16" />{{ title }}</span>
    <code v-if="comment.anchor.selector"><BuiltinIcon icon="code" :size="16" />{{ comment.anchor.selector }}</code>
    <span v-if="comment.props && Object.keys(comment.props).length"><BuiltinIcon icon="settings-adjust" :size="16" />{{ Object.keys(comment.props).length }} props</span>
    <span v-if="comment.screenshot" :title="comment.screenshot"><BuiltinIcon icon="camera" :size="16" />screenshot</span>
  </header>
</template>

<style scoped>
.comment-context { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 12px 14px; border-bottom: 1px solid var(--histoire-border); }
.comment-context span, .comment-context code { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; padding: 5px 8px; border-radius: 6px; background: var(--histoire-chip); color: var(--histoire-body); font-size: 11px; overflow-wrap: anywhere; }
.comment-context svg { color: var(--histoire-muted); width: 13px; height: 13px; }
</style>
