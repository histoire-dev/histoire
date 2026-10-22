import type { HistoireMeasureResult } from '@histoire/shared'

/** Full element rect in frame CSS pixels from position and size. */
export function box(x: number, y: number, width: number, height: number) {
  return { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x }
}

/** Deterministic numeric box keeps these tests about interaction and ownership. */
export function measureResult(x = 10): HistoireMeasureResult {
  const rect = box(x, 20, 40, 30)
  const spacing = { top: 0, right: 0, bottom: 0, left: 0 }
  return { selector: '[data-test-id="action"]', token: 'token', rect, parentRect: rect, margin: spacing, padding: spacing }
}
