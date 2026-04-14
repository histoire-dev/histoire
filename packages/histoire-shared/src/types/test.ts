import type { Story, Variant } from './story.js'

export interface HistoireSerializedTestError {
  name?: string
  message: string
  stack?: string
  diff?: string
  raw?: unknown
}

export type HistoireTestError = string | HistoireSerializedTestError

export interface HistoireTestContext {
  story: Story
  variant: Variant
  canvas: HTMLElement
}

export type HistoireTestRegistration = (context: HistoireTestContext) => void

export type HistoireTestHandler = () => Promise<void> | void

export interface HistoireSerializedTestDefinition {
  id: string
  name: string
  fullName: string
}

export interface HistoireCollectTestsPayload {
  requestId?: string
  variantKey?: string | null
}

export interface HistoireRunTestsPayload {
  runId?: string
  variantKey?: string | null
}

export interface HistoireTestDefinitionsPayload extends HistoireCollectTestsPayload {
  definitions: HistoireSerializedTestDefinition[]
}

export interface HistoireTestResultPayload extends HistoireRunTestsPayload {
  summary: HistoireTestRunSummary
}

export interface HistoireTestCaseResultInput {
  id?: string
  name: string
  fullName?: string
  state: 'passed' | 'failed' | 'skipped'
  errors: HistoireTestError[]
}

export interface HistoireTestDefinition {
  id: string
  name: string
  fullName: string
  handler?: HistoireTestHandler
}

export interface HistoireTestCaseResult {
  id: string
  name: string
  fullName: string
  state: 'passed' | 'failed' | 'skipped'
  errors: HistoireTestError[]
  storyId?: string
  variantId?: string
}

export interface HistoireTestRunSummary {
  ok: boolean
  total: number
  passed: number
  failed: number
  skipped: number
  errors: HistoireTestError[]
  tests: HistoireTestCaseResult[]
}

export interface HistoireResolvedTestCase extends HistoireSerializedTestDefinition {
  state: HistoireTestCaseResult['state'] | 'idle'
  errors: HistoireTestError[]
  storyId?: string
  variantId?: string
}

function hasProperty(value: unknown, key: string): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && key in value
}

export function serializeTestError(error: unknown): HistoireTestError {
  if (error instanceof Error) {
    const payload = error as Error & { diff?: unknown, cause?: unknown }
    return {
      name: payload.name || 'Error',
      message: payload.message || error.toString(),
      stack: payload.stack,
      diff: typeof payload.diff === 'string' ? payload.diff : undefined,
      raw: payload.cause,
    }
  }

  if (error === null || error === undefined) {
    return {
      message: 'Unknown error',
    }
  }

  if (typeof error === 'string') {
    return {
      message: error,
    }
  }

  if (hasProperty(error, 'message')) {
    const rawMessage = String(hasProperty(error, 'message') ? (error as { message: unknown }).message : '')
    return {
      name: hasProperty(error, 'name') ? String((error as { name: unknown }).name) : undefined,
      message: rawMessage || 'Unknown error',
      stack: hasProperty(error, 'stack') ? String((error as { stack: unknown }).stack ?? '') || undefined : undefined,
      diff: hasProperty(error, 'diff') ? String((error as { diff: unknown }).diff ?? '') || undefined : undefined,
      raw: (error as { raw: unknown }).raw,
    }
  }

  return {
    message: String(error),
  }
}

export function serializeTestErrors(errors: unknown[]): HistoireTestError[] {
  return errors.map(serializeTestError)
}

export function formatTestError(error: HistoireTestError): string {
  if (typeof error === 'string') {
    return error
  }

  return [error.message, error.stack, error.diff]
    .filter(Boolean)
    .join('\n\n')
}

export function serializeTestDefinitions(definitions: HistoireTestDefinition[]): HistoireSerializedTestDefinition[] {
  return definitions.map(({ id, name, fullName }) => ({
    id,
    name,
    fullName,
  }))
}

export function mergeTestDefinitionsAndSummary(
  definitions: HistoireSerializedTestDefinition[],
  summary: HistoireTestRunSummary | null | undefined,
): HistoireResolvedTestCase[] {
  const testMap = new Map(summary?.tests.map(test => [test.id, test]) ?? [])

  return definitions.map((definition) => {
    const test = testMap.get(definition.id)

    return {
      ...definition,
      state: test?.state ?? 'idle',
      errors: test?.errors ?? [],
      storyId: test?.storyId,
      variantId: test?.variantId,
    }
  })
}

export function createHistoireTestSummary(storyId: string, variantId: string, tests: HistoireTestCaseResultInput[]): HistoireTestRunSummary {
  const errors = tests.flatMap(test => test.errors)
  const passed = tests.filter(test => test.state === 'passed').length
  const failed = tests.filter(test => test.state === 'failed').length
  const skipped = tests.filter(test => test.state === 'skipped').length

  return {
    ok: failed === 0,
    total: tests.length,
    passed,
    failed,
    skipped,
    errors,
    tests: tests.map((test, index) => ({
      id: test.id ?? `${storyId}:${variantId}:${index}`,
      name: test.name,
      fullName: test.fullName ?? `${storyId} > ${variantId} > ${test.name}`,
      state: test.state,
      errors: test.errors,
      storyId,
      variantId,
    })),
  }
}
