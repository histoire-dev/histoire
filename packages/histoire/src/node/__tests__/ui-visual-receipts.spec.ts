import type { HistoireVisualApprovalReceipt } from '@histoire/shared'
import { VISUAL_APPROVAL_BATCH_LIMIT } from '@histoire/shared'
import { expect, it } from 'vitest'
import { isUiChannelEventWithinBudget } from '../server/ui-channel/validation.js'
import { visualEventChunks } from '../server/ui-channel/visual.js'

it('streams full approval batch in few events, each within channel budget', () => {
  const approved = Array.from({ length: VISUAL_APPROVAL_BATCH_LIMIT }, (_, index): HistoireVisualApprovalReceipt => ({ resultId: 'a'.repeat(63) + index.toString(16).slice(-1), status: 'approved' }))
  expect(visualEventChunks(approved)).toEqual([approved])
  // Worst case: every error message is 256 characters that each escape to six JSON bytes.
  const failed = approved.map((receipt): HistoireVisualApprovalReceipt => ({ ...receipt, status: 'error', error: '\u0001'.repeat(256) }))
  const chunks = visualEventChunks(failed)
  expect(chunks.flat()).toEqual(failed)
  for (const receipts of chunks) expect(isUiChannelEventWithinBudget('histoire:ui:visual-result', { requestId: 'x'.repeat(256), receipts, done: false })).toBe(true)
})
