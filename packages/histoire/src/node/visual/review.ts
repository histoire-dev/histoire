import type { HistoireVisualCase, HistoireVisualResult, UiVisualCase, UiVisualResult } from '@histoire/shared'

/** Keep exact review identity while durable props and axis snapshots stay private. */
export function visualReviewCase(item: HistoireVisualCase): UiVisualCase {
  const { propsOverride: _props, axes: _axes, ...review } = item
  return review
}

/** Send image references and outcomes without duplicating capture input on WebSocket. */
export function visualReviewResult(result: HistoireVisualResult): UiVisualResult {
  const { case: item, spec, workingRevision: _revision, ...review } = result
  return { ...review, case: visualReviewCase(item), spec: { id: spec.id } }
}
