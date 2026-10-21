<script setup lang="ts">
import type { UiComment, UiCommentDraft } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import { compactSelectorPath, propsSummary, selectorParts } from './presentation'

const props = defineProps<{
  /** Human-readable story and variant. */
  title: string
  /** Persisted or composer context. */
  comment: UiComment | UiCommentDraft
  /** Show a control collapsing the card back to its pin. */
  minimizable?: boolean
  /** Screenshot is shown as an attachment elsewhere (composer). */
  hideScreenshot?: boolean
}>()
const emit = defineEmits<{
  /** Collapse card back to its pin. */
  minimize: []
}>()

/** Picked element split into story root label, its deepest path segments, and readable full path for tooltip. */
const element = computed(() => {
  const selector = props.comment.anchor.selector
  if (!selector) return null
  const parts = selectorParts(selector)
  const label = parts.storyRoot ? 'Story root' : 'Element'
  return { label, path: compactSelectorPath(parts.path), full: parts.storyRoot ? [label, parts.path].filter(Boolean).join(' > ') : selector }
})

/** Captured prop values shown inline; tooltip lists one per line. */
const propLines = computed(() => propsSummary(props.comment.props))
</script>

<template>
  <header class="comment-context">
    <div class="context-title">
      <BuiltinIcon icon="cube" :size="16" />
      <span class="title-text">{{ title }}</span>
      <div v-if="minimizable || $slots.actions" class="context-actions">
        <slot name="actions" />
        <HstButton v-if="minimizable" icon-only color="flat" type="button" aria-label="Minimize comment" title="Minimize" @click="emit('minimize')">
          <BuiltinIcon icon="subtract" :size="16" />
        </HstButton>
      </div>
    </div>
    <div v-if="element || propLines.length || (comment.screenshot && !hideScreenshot)" class="context-chips">
      <span v-if="element" class="chip" :title="element.full">
        <BuiltinIcon icon="code" :size="16" />
        <span class="chip-text">{{ element.label }}<code v-if="element.path">{{ element.path }}</code></span>
      </span>
      <span v-if="propLines.length" class="chip" :title="propLines.join('\n')">
        <BuiltinIcon icon="settings-adjust" :size="16" />
        <span class="chip-text">Props<code>{{ propLines.join(', ') }}</code></span>
      </span>
      <span v-if="comment.screenshot && !hideScreenshot" class="chip" :title="comment.screenshot">
        <BuiltinIcon icon="camera" :size="16" />
        <span class="chip-text">Screenshot</span>
      </span>
    </div>
  </header>
</template>

<style scoped>
.comment-context { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--histoire-border); }
/* Story/variant heading shares its row with card actions so chips get full width. */
.context-title { display: flex; align-items: center; gap: 6px; min-width: 0; min-height: 24px; color: var(--histoire-text); font-size: 12px; font-weight: 600; }
.context-title > svg { flex: none; width: 13px; height: 13px; color: var(--histoire-muted); }
.title-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.context-actions { flex: none; display: flex; gap: 2px; margin: -2px -4px -2px 0; }
.context-actions :deep(button) { --histoire-icon-button-size: 24px; color: var(--histoire-muted); }
/* One line of context; chips shrink and truncate instead of wrapping. */
.context-chips { display: flex; gap: 4px; min-width: 0; }
.chip { display: inline-flex; flex: 0 1 auto; align-items: center; gap: 5px; min-width: 0; height: 22px; padding: 0 7px; border-radius: 5px; background: var(--histoire-chip); color: var(--histoire-body); font-size: 11px; line-height: 1; white-space: nowrap; }
.chip svg { flex: none; width: 13px; height: 13px; color: var(--histoire-muted); }
.chip-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* Detail after the label reads as secondary metadata. */
.chip-text code { margin-left: 6px; color: var(--histoire-muted); font-family: var(--histoire-font-mono, "JetBrains Mono", monospace); font-size: 10.5px; }
</style>
