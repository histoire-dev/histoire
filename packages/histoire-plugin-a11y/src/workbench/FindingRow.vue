<script setup lang="ts">
import type { AuditReport } from '../messages.js'
import type { NodeFinding } from './locate.js'
import { computed, onScopeDispose, reactive, ref } from 'vue'
import { groupNodesByFix } from './fix-summary.js'

const props = defineProps<{
  /** Bounded finding from exact actor. */
  rule: AuditReport['violations'][number]
  /** Outcome category of the rule. */
  outcome: NodeFinding['outcome']
}>()
const emit = defineEmits<{
  /** Highlight one reported element in the variant canvas. */
  highlight: [finding: NodeFinding]
}>()

/** Fix items shown before "N more". */
const VISIBLE_ITEMS = 3

type RuleNode = AuditReport['violations'][number]['nodes'][number]

// Elements sharing a fix list it once; numbers run across groups in report order.
const groups = computed(() => {
  let number = 0
  return groupNodesByFix(props.rule.nodes).map(group => ({ ...group, nodes: group.nodes.map(node => ({ node, number: ++number })) }))
})
/** Fix lists expanded past {@link VISIBLE_ITEMS}, by `group:section` index. */
const expanded = reactive(new Set<string>())
/** Number of the element whose selector was just copied. */
const copied = ref<number>()
let copiedTimer: ReturnType<typeof setTimeout> | undefined
onScopeDispose(() => clearTimeout(copiedTimer))

/**
 * Selector chain as displayed and copied (frames first).
 * @param node Affected element.
 */
function selector(node: RuleNode): string {
  return node.selectors.join(' / ')
}

/**
 * Copy an element selector, confirming on the button for a moment.
 * @param node Affected element.
 * @param number Element number in the row.
 */
async function copy(node: RuleNode, number: number): Promise<void> {
  try {
    await navigator.clipboard.writeText(selector(node))
    copied.value = number
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => copied.value = undefined, 1500)
  }
  catch { /* Clipboard access can be denied; the selector stays selectable. */ }
}

/**
 * Toggle a clamped fix list.
 * @param key `group:section` index.
 */
function toggle(key: string): void {
  if (!expanded.delete(key)) expanded.add(key)
}
</script>

<template>
  <details class="histoire-a11y-rule">
    <summary>
      <span class="histoire-a11y-rule-meta">
        <span class="histoire-a11y-impact" :data-impact="rule.impact">{{ rule.impact ?? 'unknown' }}</span>
        <span class="histoire-a11y-rule-count">{{ rule.nodes.length }} {{ rule.nodes.length === 1 ? 'element' : 'elements' }}</span>
      </span>
      <strong>{{ rule.help }}</strong>
    </summary>
    <div class="histoire-a11y-details">
      <div v-for="(group, groupIndex) in groups" :key="groupIndex" class="histoire-a11y-fix-group">
        <ol class="histoire-a11y-elements">
          <li v-for="{ node, number } in group.nodes" :key="number" class="histoire-a11y-element">
            <span class="histoire-a11y-element-number">{{ number }}</span>
            <code class="histoire-a11y-selector" :title="selector(node)">{{ selector(node) }}</code>
            <button type="button" class="histoire-a11y-icon-button histoire-a11y-copy" :aria-label="copied === number ? 'Copied' : 'Copy selector'" :title="copied === number ? 'Copied' : 'Copy selector'" @click="copy(node, number)">
              <svg v-if="copied === number" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
              <svg v-else viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" /></svg>
            </button>
            <button type="button" class="histoire-a11y-icon-button" aria-label="Highlight in canvas" title="Highlight in canvas" @click="emit('highlight', { outcome, rule: rule.id, selectors: node.selectors, index: rule.nodes.indexOf(node), count: rule.nodes.length })">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.75" /><path d="M8 1v3M8 12v3M1 8h3M12 8h3" /></svg>
            </button>
          </li>
        </ol>
        <div v-for="(section, sectionIndex) in group.sections" :key="sectionIndex" class="histoire-a11y-fix">
          <div class="histoire-a11y-fix-head">
            <span class="histoire-a11y-fix-label">{{ section.kind === 'all' ? 'Fix all' : 'Fix any' }}</span>
            <a v-if="groupIndex === 0 && sectionIndex === 0" class="histoire-a11y-rule-id" :href="rule.helpUrl" target="_blank" rel="noopener noreferrer" title="Rule guidance">
              {{ rule.id }}
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" /></svg>
            </a>
          </div>
          <ul class="histoire-a11y-fix-items">
            <li v-for="(item, itemIndex) in expanded.has(`${groupIndex}:${sectionIndex}`) ? section.items : section.items.slice(0, VISIBLE_ITEMS)" :key="itemIndex">
              {{ item }}
            </li>
          </ul>
          <button v-if="section.items.length > VISIBLE_ITEMS" type="button" class="histoire-a11y-more" @click="toggle(`${groupIndex}:${sectionIndex}`)">
            {{ expanded.has(`${groupIndex}:${sectionIndex}`) ? 'Show less' : `${section.items.length - VISIBLE_ITEMS} more` }}
          </button>
        </div>
      </div>
      <!-- Without failure details the guidance link has no fix box to sit in. -->
      <a v-if="!groups[0]?.sections.length" class="histoire-a11y-rule-id" :href="rule.helpUrl" target="_blank" rel="noopener noreferrer" title="Rule guidance">
        {{ rule.id }}
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" /></svg>
      </a>
    </div>
  </details>
</template>
