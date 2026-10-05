import type { HistoireMeasureResult } from '@histoire/shared'

/** Deterministic numeric box keeps these tests about interaction and ownership. */
export function measureResult(x = 10): HistoireMeasureResult {
  const rect = { x, y: 20, width: 40, height: 30, top: 20, right: x + 40, bottom: 50, left: x }
  const spacing = { top: 0, right: 0, bottom: 0, left: 0 }
  return { selector: '[data-test-id="action"]', rect, parentRect: rect, margin: spacing, padding: spacing }
}
