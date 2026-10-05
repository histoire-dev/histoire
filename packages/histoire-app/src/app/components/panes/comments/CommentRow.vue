<script setup lang="ts">
import type { UiComment, UiCommentAgent } from '@histoire/shared'
import { HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import { commentAge } from '../../comments/presentation.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const props = defineProps<{
  /** Persisted annotation. */
  comment: UiComment
  /** Stable visible ordinal across filters. */
  number: number
  /** Collected variant title or orphan ID. */
  title: string
  /** Exact thread currently open on canvas. */
  active: boolean
  /** Safe agent display metadata. */
  agents: readonly UiCommentAgent[]
}>()
const emit = defineEmits<{
  /** Open this exact annotation; orphan rows remain readable. */
  select: []
}>()
const agent = computed(() => props.agents.find(agent => agent.id === props.comment.agentId)?.name ?? props.comment.agentId ?? 'Agent')
const status = computed(() => props.comment.status === 'draft' ? 'Not sent yet' : props.comment.status === 'resolved' ? 'Resolved' : props.comment.status === 'replied' ? `${agent.value} replied` : props.comment.status === 'sent' ? `${agent.value} queued` : `${agent.value} is working…`)
</script>

<template>
  <HstButton color="flat" type="button" class="comment-row" :class="{ active }" :aria-current="active ? 'true' : undefined" @click="emit('select')">
    <span class="row-pin" :class="{ draft: comment.status === 'draft' }">{{ number }}</span>
    <span class="row-content"><span class="row-title"><strong>{{ title }}</strong><time :datetime="comment.updatedAt" :title="comment.updatedAt">{{ commentAge(comment.updatedAt) }}</time></span><span class="row-body">{{ comment.body }}</span><span class="row-status" :class="{ neutral: comment.status === 'draft' || comment.status === 'resolved' }"><WorkbenchIcon :name="comment.status === 'draft' ? 'edit' : comment.status === 'resolved' ? 'checkmark' : comment.status === 'working' ? 'in-progress' : 'bot'" />{{ status }}</span></span>
  </HstButton>
</template>

<style scoped>
.comment-row { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: var(--histoire-comment-row-padding, 12px) 9px; color: var(--histoire-text); text-align: left; }
.comment-row:hover { background: var(--histoire-chip); }.comment-row.active { background: var(--histoire-agent-soft); }
.row-pin { display: grid; place-items: center; flex: none; width: 23px; height: 25px; border-radius: 50% 50% 50% 4px; background: var(--histoire-agent); color: #fff; font-size: 10px; font-weight: 700; }
.row-pin.draft { background: var(--histoire-muted); }
.row-content { display: grid; gap: 5px; min-width: 0; }
.row-title { display: flex; flex-wrap: wrap; gap: 7px; align-items: baseline; font-size: 12px; }time { color: var(--histoire-muted); font-size: 11px; }
.row-body { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; color: var(--histoire-body); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
.row-status { display: flex; align-items: center; gap: 5px; color: var(--histoire-agent-text); font-size: 11px; font-weight: 700; }.row-status.neutral { color: var(--histoire-muted); }.row-status svg { width: 13px; height: 13px; }
</style>
