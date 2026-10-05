import type { HistoireBridgeCommand } from './types.js'
import { HISTOIRE_ERROR_CODES } from '../types/error.js'
import { validateHistoireCatalogStory } from './catalog.js'
import { validateWireValue } from './size.js'
import { validateHistoireStateSnapshot } from './snapshot.js'
import { validateHistoireTestExecution } from './test-execution.js'
import { invalid, validateHistoireTarget, wireId, wireRecord } from './validation.js'

/** JSON-safe bounded error; uncontrolled Error instances cannot enter callbacks. */
export function validateHistoireErrorData(value: unknown): void {
  validateWireValue(value, { kind: 'error', name: '' })
  const input = wireRecord(value)
  if (!HISTOIRE_ERROR_CODES.includes(input.code as any) || typeof input.message !== 'string') invalid('Invalid bridge error')
}

/** Existing test-error representation with controlled portable fields. */
function validateTestError(value: unknown): void {
  if (typeof value === 'string') return
  const input = wireRecord(value)
  if (typeof input.message !== 'string') invalid('Invalid test error')
  for (const key of ['name', 'stack', 'diff']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') invalid('Invalid test error field')
  }
}

/** Existing wire-safe definition/summary fields retain names and assertion semantics. */
export function validateHistoireTestResult(value: unknown, summary: boolean): void {
  const input = wireRecord(value)
  if (input.execution !== undefined) validateHistoireTestExecution(input.execution)
  if (!summary) {
    if (!Array.isArray(input.definitions)) invalid('Invalid test collection')
    for (const value of input.definitions) {
      const test = wireRecord(value)
      if (!wireId(test.id) || typeof test.name !== 'string' || typeof test.fullName !== 'string' || (test.mode !== undefined && !['run', 'skip', 'only', 'todo'].includes(test.mode as string))) invalid('Invalid test definition')
      if (test.timeout !== undefined && (typeof test.timeout !== 'number' || !Number.isFinite(test.timeout) || test.timeout < 0)) invalid('Invalid test deadline')
    }
    if (input.error !== undefined && input.error !== null) validateTestError(input.error)
    return
  }
  if (typeof input.ok !== 'boolean' || !Array.isArray(input.errors) || !Array.isArray(input.tests)) invalid('Invalid test run summary')
  for (const key of ['total', 'passed', 'failed', 'skipped']) {
    if (!Number.isSafeInteger(input[key]) || (input[key] as number) < 0) invalid('Invalid test count')
  }
  for (const error of input.errors) validateTestError(error)
  for (const value of input.tests) {
    const test = wireRecord(value)
    if (!wireId(test.id) || typeof test.name !== 'string' || typeof test.fullName !== 'string' || !['passed', 'failed', 'skipped'].includes(test.state as string) || !Array.isArray(test.errors)) invalid('Invalid test case')
    for (const error of test.errors) validateTestError(error)
    for (const key of ['storyId', 'variantId']) {
      if (test[key] !== undefined && !wireId(test[key])) invalid('Invalid test target')
    }
  }
  if (input.uncollectedStories !== undefined) {
    if (!Array.isArray(input.uncollectedStories)) invalid('Invalid uncollected stories')
    for (const value of input.uncollectedStories) {
      const story = wireRecord(value)
      if (typeof story.relativePath !== 'string' || typeof story.error !== 'string') invalid('Invalid collection failure')
    }
  }
}

/** Lazy content has captured identity and finite origin/format semantics. */
export function validateHistoireContent(value: unknown, docs: boolean): void {
  const input = wireRecord(value)
  if (!wireId(input.storyId) || !wireId(input.epoch) || !wireId(input.revision) || typeof input.body !== 'string' || (input.variantId !== undefined && !wireId(input.variantId))) invalid('Invalid content identity/body')
  if (docs
    ? !['sibling', 'standalone', 'inline', 'collected'].includes(input.origin as string) || !['html', 'text'].includes(input.format as string)
    : !['file', 'virtual', 'generated', 'explicit', 'slot'].includes(input.origin as string) || !['raw', 'dynamic'].includes(input.mode as string)) {
    invalid('Invalid content kind')
  }
  for (const key of ['relativePath', 'language']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') invalid('Invalid content label')
  }
}

/** Correlated successful result must match requested command before observers see it. */
export function validateBridgeResult(command: HistoireBridgeCommand, value: unknown): void {
  validateWireValue(value, { kind: 'response', name: command })
  if (command === 'catalog.list') {
    if (!Array.isArray(value)) invalid('Expected catalog stories')
    for (const story of value) validateHistoireCatalogStory(story)
  }
  else if (command === 'catalog.getStory') {
    validateHistoireCatalogStory(value)
  }
  else if (command === 'catalog.search') {
    if (!Array.isArray(value)) invalid('Expected search results')
    for (const entry of value) {
      const result = wireRecord(entry)
      validateHistoireTarget(result.target)
      if (!['story', 'variant', 'docs'].includes(result.kind as string) || typeof result.title !== 'string' || typeof result.rank !== 'number' || !Number.isFinite(result.rank)) invalid('Invalid search result')
      for (const key of ['excerpt', 'anchor']) {
        if (result[key] !== undefined && typeof result[key] !== 'string') invalid('Invalid search excerpt')
      }
    }
  }
  else if (['state.get', 'state.patch', 'state.reset'].includes(command)) {
    if (value !== null || command === 'state.get') validateHistoireStateSnapshot(value)
  }
  else if (command === 'docs.get' || command === 'source.get') {
    validateHistoireContent(value, command === 'docs.get')
  }
  else if (command === 'tests.collect' || command === 'tests.run') {
    validateHistoireTestResult(value, command === 'tests.run')
  }
  else if (command === 'tests.cancel') {
    const result = wireRecord(value)
    if (Object.keys(result).some(key => !['requestId', 'cancelled'].includes(key)) || !wireId(result.requestId) || result.cancelled !== true) invalid('Invalid test cancellation acknowledgment')
  }
  else if (command === 'controls.preset') {
    const input = wireRecord(value)
    if (Object.keys(input).some(key => !['items', 'selectedId'].includes(key)) || !Array.isArray(input.items) || input.items.length > 1000
      || (input.selectedId !== undefined && !wireId(input.selectedId))) {
      invalid('Invalid preset result')
    }
    for (const value of input.items) {
      const item = wireRecord(value)
      if (Object.keys(item).some(key => !['id', 'label'].includes(key)) || !wireId(item.id) || typeof item.label !== 'string' || item.label.length > 120) invalid('Invalid preset option')
    }
  }
  else if (value !== null) {
    invalid('Expected null acknowledgment')
  }
}
