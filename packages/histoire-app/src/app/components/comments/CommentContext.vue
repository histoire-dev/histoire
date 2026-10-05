<script setup lang="ts">
import type { UiComment, UiCommentDraft } from '@histoire/shared'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'

defineProps<{
  /** Human-readable story and variant. */
  title: string
  /** Persisted or composer context. */
  comment: UiComment | UiCommentDraft
}>()
</script>

<template>
  <header class="comment-context">
    <span><WorkbenchIcon name="cube" />{{ title }}</span>
    <code v-if="comment.anchor.selector"><WorkbenchIcon name="code" />{{ comment.anchor.selector }}</code>
    <span v-if="comment.props && Object.keys(comment.props).length"><WorkbenchIcon name="settings-adjust" />{{ Object.keys(comment.props).length }} props</span>
    <span v-if="comment.screenshot" :title="comment.screenshot"><WorkbenchIcon name="camera" />screenshot</span>
  </header>
</template>

<style scoped>
.comment-context { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 12px 14px; border-bottom: 1px solid var(--histoire-border); }
.comment-context span, .comment-context code { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; padding: 5px 8px; border-radius: 6px; background: var(--histoire-chip); color: var(--histoire-body); font-size: 11px; overflow-wrap: anywhere; }
.comment-context svg { color: var(--histoire-muted); width: 13px; height: 13px; }
</style>
