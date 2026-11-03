<script setup lang="ts">
import type { NodeFinding } from './locate.js'
import type { ProjectGroup } from './project-model.js'
import { computed } from 'vue'
import FindingRow from './FindingRow.vue'
import { worstImpact } from './project-model.js'

const props = defineProps<{
  /** Variant row with its matching findings. */
  group: ProjectGroup
  /** Outcome category the findings belong to. */
  outcome: NodeFinding['outcome']
}>()
const emit = defineEmits<{
  /** Select the variant and show its accessibility tab. */
  open: []
  /** Highlight one reported element in the variant canvas. */
  highlight: [finding: NodeFinding]
}>()

const impact = computed(() => worstImpact(props.group.findings))
const count = computed(() => `${props.group.findings.length} ${props.group.findings.length === 1 ? 'rule' : 'rules'}`)
</script>

<template>
  <!-- Flat row: only the rules inside are cards, so findings never nest card in card. -->
  <details class="histoire-a11y-variant">
    <summary>
      <span class="histoire-a11y-variant-title">
        <span class="histoire-a11y-variant-story">{{ group.storyTitle }}</span>
        <span class="histoire-a11y-variant-name">{{ group.variantTitle }}</span>
      </span>
      <span v-if="group.stale" class="histoire-a11y-variant-flag" title="Results may be outdated">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></svg><span class="histoire-a11y-sr">Results may be outdated</span>
      </span>
      <span v-if="group.report" class="histoire-a11y-count" :data-impact="impact" :title="count">
        {{ group.findings.length }}<span class="histoire-a11y-sr">{{ group.findings.length === 1 ? 'rule' : 'rules' }}</span>
      </span>
      <span v-else class="histoire-a11y-variant-flag histoire-a11y-variant-failed" title="Check failed">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" /></svg><span class="histoire-a11y-sr">Check failed</span>
      </span>
      <!-- Inside the summary: prevent the click from also toggling the row. -->
      <button type="button" class="histoire-a11y-icon-button" aria-label="Open variant" title="Open variant" @click.prevent="emit('open')">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" /></svg>
      </button>
    </summary>
    <div class="histoire-a11y-variant-body">
      <pre v-if="group.error && !group.report" class="histoire-a11y-error">{{ group.error }}</pre>
      <FindingRow v-for="rule in group.findings" :key="rule.id" :rule="rule" :outcome="outcome" @highlight="emit('highlight', $event)" />
    </div>
  </details>
</template>
