import type { HistoireJsonValue } from '@histoire/protocol'
import type { HistoireTestRuntimeContext } from '@histoire/shared'
import type { A11yTestOptions } from './options.js'
import { pushHistoireTestRegistration, registerCollectedTestCase, setHistoireTestData } from '@histoire/shared'
import { A11Y_TEST_DATA_KEY, A11Y_TEST_NAME } from './results.js'
import { evaluateResults } from './scanner/policy.js'
import { runAudit } from './scanner/run.js'

export type { A11yTestOptions } from './options.js'

/**
 * Assert accessibility of current story state, independent of workbench preferences.
 * @param canvas Variant root to scan.
 * @param options Scan settings and failure threshold.
 * @param context Optional test runtime context; when given, the bounded report is attached to the
 * test result (also on failure) so the workbench Accessibility pane can list findings.
 */
export async function assertA11y(canvas: HTMLElement, options: A11yTestOptions = {}, context?: Pick<HistoireTestRuntimeContext, 'task'>): Promise<void> {
  const result = await runAudit(canvas, options)
  setHistoireTestData(context, A11Y_TEST_DATA_KEY, { report: result.report as unknown as HistoireJsonValue })
  const policy = evaluateResults(result.raw, options.minimumImpact)
  // eslint-disable-next-line no-console -- Informational CLI findings are distinct from failed assertions.
  if (policy.review || policy.belowThreshold) console.info(`[Accessibility] ${policy.review} rules need review; ${policy.belowThreshold} violations below failure threshold`)
  if (policy.failed) throw new Error(`${policy.failed} accessibility ${policy.failed === 1 ? 'violation' : 'violations'}\n\n${policy.message}`)
}

/** Register one isolated test; called by generated framework setup hooks. Never scans during discovery. */
export function registerA11yTests(options: A11yTestOptions): void {
  pushHistoireTestRegistration(({ canvas }) => {
    registerCollectedTestCase(A11Y_TEST_NAME, context => assertA11y(canvas, options, context), (options.timeoutMs ?? 10000) + 1000)
  })
}
