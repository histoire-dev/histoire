import type { HistoireJsonValue, HistoireTestData } from '@histoire/protocol'
import { validateHistoireTestData } from '@histoire/protocol'

/** Vitest task meta key holding plugin-keyed test data until results are summarized. */
export const HISTOIRE_TEST_DATA_META_KEY = 'histoireData'

/** Minimal runtime context shape: Vitest's task or Histoire's compatible preview task. */
interface TestDataContext {
  /** Current task; only its `meta` record is used. */
  task?: { meta?: Record<string, unknown> } | null
}

/**
 * Attaches JSON data to the running test's result under a plugin key. The data survives
 * failures, so a test can report structured findings and still throw.
 * @param context Runtime context passed to the test handler.
 * @param key Plugin key, for example the plugin id.
 * @param value JSON data; the whole per-test record is bounded by `HISTOIRE_TEST_DATA_LIMIT`.
 * @returns Whether the data was stored; `false` without a task or when the bound is exceeded.
 */
export function setHistoireTestData(context: TestDataContext | undefined, key: string, value: HistoireJsonValue): boolean {
  const meta = context?.task?.meta
  if (!meta || typeof meta !== 'object') return false
  const next = { ...readHistoireTestData(meta), [key]: value }
  try {
    validateHistoireTestData(next)
  }
  catch (error) {
    console.warn(`[histoire] Test data "${key}" dropped:`, error instanceof Error ? error.message : error)
    return false
  }
  meta[HISTOIRE_TEST_DATA_META_KEY] = next
  return true
}

/**
 * Reads valid test data from a task meta record; invalid or missing data reads as `undefined`.
 * @param meta Task meta, as returned by Vitest's `TestCase.meta()`.
 */
export function readHistoireTestData(meta: unknown): HistoireTestData | undefined {
  const value = (meta as Record<string, unknown> | undefined)?.[HISTOIRE_TEST_DATA_META_KEY]
  if (value === undefined) return
  try {
    validateHistoireTestData(value)
    return value as HistoireTestData
  }
  catch {
    return undefined
  }
}
