import type { UiVisualResult } from '@histoire/shared'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualEvidence } from './recovery.js'
import type { VisualSource } from './source.js'
import { listVisualCases } from './cases.js'
import { readVisualRecoveryInventory, validateVisualEvidence } from './recovery.js'

/** Browser-local descriptor snapshot; expensive PNG/source validation happens per page. */
export function createVisualRecoveryPages(current: () => { source: VisualSource, config: ResolvedVisualConfig }, register: (evidence: VisualEvidence) => UiVisualResult) {
  let snapshot: { source: VisualSource, config: ResolvedVisualConfig, entries: VisualEvidence[], issues: string[], failures: Set<number> } | undefined
  let closed = false
  return {
    /** Inspect at most 32 candidates per request and respect compact channel byte budget. */
    async page(offset = 0) {
      if (closed) throw new Error('Visual review session closed')
      if (!offset) {
        const { source, config } = current()
        snapshot = { source, config, ...await readVisualRecoveryInventory(source, config), failures: new Set() }
      }
      const inventory = snapshot
      if (!inventory || closed || !inventory.source.isActive()) throw new Error('Visual source changed during recovery')
      const results: UiVisualResult[] = []
      const issues = offset ? [] : [...inventory.issues]
      const cases = await listVisualCases(inventory.source.ctx, inventory.config)
      let next = offset
      for (; next < Math.min(offset + 32, inventory.entries.length); next++) {
        const evidence = inventory.entries[next]
        try {
          evidence.staleReason = await validateVisualEvidence(inventory.source, inventory.config, evidence, false, cases)
          if (closed || !inventory.source.isActive()) throw new Error('Visual source changed during recovery')
          const result = register(evidence)
          if (new TextEncoder().encode(JSON.stringify([...results, result])).byteLength > 48 * 1024) {
            if (!results.length) throw new Error('Visual result exceeds channel page limit')
            break
          }
          results.push(result)
        }
        catch (error) {
          inventory.failures.add(next)
          issues.push(error instanceof Error ? error.message.slice(0, 256) : 'Cached visual result unavailable')
        }
      }
      if (closed || !inventory.source.isActive()) throw new Error('Visual source changed during recovery')
      return { results, total: inventory.entries.length - inventory.failures.size, issues: issues.slice(0, 32), ...(next < inventory.entries.length ? { nextOffset: next } : {}) }
    },
    /** Retire snapshot along with browser's approval handles. */
    close() {
      closed = true
      snapshot = undefined
    },
  }
}
