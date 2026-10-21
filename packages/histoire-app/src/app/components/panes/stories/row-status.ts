import type { HistoireCatalog, HistoireTarget } from '@histoire/protocol'
import type { Ref } from 'vue'
import type { WorkbenchTestsModel } from '../tests/model.js'
import type { StoryTreeRow } from './tree.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { computed } from 'vue'

/**
 * Per-row diagnostic and failing-test lookups for the story tree.
 * Lookup sets rebuild only with the catalog or project test rows, so each
 * rendered row answers in constant time instead of scanning every diagnostic/test.
 */
export function useStoryRowStatus(catalog: Readonly<Ref<HistoireCatalog>>, tests: WorkbenchTestsModel | undefined) {
  /** Story IDs and relative paths carrying catalog diagnostics. */
  const diagnosticKeys = computed(() => {
    const keys = { storyIds: new Set<string>(), paths: new Set<string>() }
    for (const value of catalog.value.diagnostics) {
      if (value.storyId) keys.storyIds.add(value.storyId)
      if (value.relativePath) keys.paths.add(value.relativePath)
    }
    return keys
  })

  /** Failing story IDs plus exact variant keys of current (non-stale) failures. */
  const failingKeys = computed(() => {
    const keys = new Set<string>()
    for (const test of tests?.rows.value ?? []) {
      if (!test.failed || test.stale) continue
      keys.add(test.target.storyId)
      if (test.target.variantId !== null) keys.add(getHistoireTargetKey(test.target))
    }
    return keys
  })

  /** Catalog warnings stay visible and selectable, including failed collection sources. */
  function hasDiagnostic(row: StoryTreeRow): boolean {
    if (row.kind !== 'story' || !row.story) return false
    return diagnosticKeys.value.storyIds.has(row.story.id) || (!!row.story.relativePath && diagnosticKeys.value.paths.has(row.story.relativePath))
  }

  /** Exact result attribution avoids variant-key parsing and unrelated run failures. */
  function testsFailing(row: StoryTreeRow): boolean {
    if (!row.target) return false
    if (row.kind !== 'variant') return failingKeys.value.has(row.target.storyId)
    return failingKeys.value.has(getHistoireTargetKey(row.target as HistoireTarget))
  }

  return { hasDiagnostic, testsFailing }
}
