import type { HistoireTestExecutionIdentity } from '../types/test.js'
import { invalid, validateHistoireTarget, wireId, wireRecord } from './validation.js'

/** Finite attribution DTO excludes callbacks, loaders, private paths and arbitrary metadata. */
export function validateHistoireTestExecution(value: unknown): asserts value is HistoireTestExecutionIdentity {
  const input = wireRecord(value)
  if (Object.keys(input).some(key => !['runId', 'mode', 'target', 'sourceId', 'epoch', 'revision', 'runtimeId'].includes(key))) invalid('Invalid test execution fields')
  if (!wireId(input.runId) || !['preview', 'server'].includes(input.mode as string)) invalid('Invalid test execution identity')
  if (input.target !== undefined) validateHistoireTarget(input.target)
  const target = input.target as HistoireTestExecutionIdentity['target']
  const source = ['sourceId', 'epoch', 'revision'].filter(key => input[key] !== undefined)
  if (source.length && source.length !== 3) invalid('Incomplete test source identity')
  for (const key of source) {
    if (!wireId(input[key])) invalid('Invalid test source identity')
  }
  if (input.mode === 'preview' ? !wireId(input.runtimeId) || !target?.variantId || source.length !== 3 : input.runtimeId !== undefined) invalid('Invalid test runtime identity')
}
