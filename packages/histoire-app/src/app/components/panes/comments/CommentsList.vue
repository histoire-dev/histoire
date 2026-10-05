<script setup lang="ts">
import type { HistoireCatalogStory } from '@histoire/protocol'
import type { UiComment, UiCommentAgent } from '@histoire/shared'
import type { CommentsGroup } from '../../comments/presentation.js'
import { computed } from 'vue'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import CommentRow from './CommentRow.vue'

const props = defineProps<{
  /** Filtered chronological story groups. */
  groups: readonly CommentsGroup[]
  /** Full persisted list supplies stable ordinals. */
  comments: readonly UiComment[]
  /** Canonical collected metadata. */
  stories: readonly HistoireCatalogStory[]
  /** Current thread identity. */
  activeId?: string | null
  /** Safe ACP display states. */
  agents: readonly UiCommentAgent[]
}>()
const emit = defineEmits<{
  /** Reveal exact known or orphan thread. */
  select: [comment: UiComment]
}>()
/** Flattened headings retain their own recycling pool and story identity. */
interface CommentHeading {
  /** Group identity remains distinct from exact annotation IDs. */
  key: string
  /** Recycled heading views never become annotation controls. */
  kind: 'heading'
  /** Collected story path or persisted orphan identity. */
  title: string
  /** Removed targets stay visible in saved history. */
  orphaned: boolean
}
/** Annotation metadata is indexed once, rather than scanned for every recycled row. */
interface CommentItem {
  /** Exact persisted annotation ID. */
  key: string
  /** Annotation views recycle independently from group headings. */
  kind: 'comment'
  /** Persisted annotation retains its full target and body. */
  comment: UiComment
  /** Original ordinal is unchanged by filtering or virtualization. */
  number: number
  /** Orphaned variants retain their exact identity as title. */
  title: string
}
const rows = computed<(CommentHeading | CommentItem)[]>(() => {
  const ordinals = new Map(props.comments.map((comment, index) => [comment.id, index + 1]))
  const titles = new Map(props.stories.map(story => [story.id, new Map(story.variants.map(variant => [variant.id, variant.title]))]))
  return props.groups.flatMap((group): (CommentHeading | CommentItem)[] => [
    { key: JSON.stringify(['group', group.storyId, group.orphaned]), kind: 'heading', title: group.title, orphaned: group.orphaned },
    ...group.comments.map((comment): CommentItem => ({
      key: comment.id,
      kind: 'comment',
      comment,
      number: ordinals.get(comment.id) ?? 0,
      title: titles.get(comment.storyId)?.get(comment.variantId) ?? comment.variantId,
    })),
  ])
})
</script>

<template>
  <WorkbenchVirtualList :items="rows" :min-item-size="34" page-mode>
    <template #default="{ item }">
      <h3 v-if="item.kind === 'heading'">
        <WorkbenchIcon name="cube" />{{ item.title }}<small v-if="item.orphaned">Orphaned</small>
      </h3>
      <CommentRow v-else :comment="item.comment" :number="item.number" :title="item.title" :active="activeId === item.key" :agents="agents" @select="emit('select', item.comment)" />
    </template>
  </WorkbenchVirtualList>
</template>

<style scoped>
h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 0; padding: 20px 9px 6px; color: var(--histoire-muted); font-size: 11px; font-weight: 700; }h3 svg { width: 12px; height: 12px; }small { margin-left: auto; color: var(--histoire-warn); font-size: 10px; }
</style>
