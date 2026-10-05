import type { HistoireTarget } from '../types/common.js'
import type { HistoireProjectTestCollectionResult } from '../types/test.js'
import { getHistoireTargetKey } from '../types/common.js'
import { validateHistoireTestResult } from './results.js'
import { validateWireValue } from './size.js'
import { validateHistoireTestExecution } from './test-execution.js'
import { invalid, validateHistoireTarget, wireRecord } from './validation.js'

/** Validate bounded collection evidence, optionally requiring the complete admitted target inventory. */
export function validateProjectTestCollection(value: unknown, targets?: readonly HistoireTarget[]): asserts value is HistoireProjectTestCollectionResult {
  validateWireValue(value, { kind: 'response', name: 'tests.collect' })
  const input = wireRecord(value)
  validateHistoireTestExecution(input.execution)
  if ((input.execution as HistoireProjectTestCollectionResult['execution']).mode !== 'server') invalid('Invalid project collection engine')
  if (!Array.isArray(input.variants)) invalid('Invalid project test collection')
  const seen = new Set<string>()
  for (const item of input.variants) {
    const entry = wireRecord(item)
    validateHistoireTarget(entry.target)
    const target = entry.target as HistoireProjectTestCollectionResult['variants'][number]['target']
    if (target.variantId === null) invalid('Project collection requires variant identity')
    const key = getHistoireTargetKey(target)
    if (seen.has(key)) invalid('Duplicate project collection target')
    seen.add(key)
    validateHistoireTestResult(entry.collection, false)
  }
  if (targets) {
    const admitted = new Set(targets.map(getHistoireTargetKey))
    if (seen.size !== admitted.size || [...seen].some(key => !admitted.has(key))) invalid('Test discovery target inventory changed')
  }
}
