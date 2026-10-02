import type { HistoireTestRunSummary } from '@histoire/shared'
import { z } from 'zod/v4'
import { mcpIdSchema, mcpRelativePathSchema } from './ids.js'

/** Wire-only serialized shared test error: raw objects are deliberately excluded. */
const testErrorSchema = z.union([z.string(), z.strictObject({
  /** Optional error name. */
  name: z.string().optional(),
  /** Assertion or lifecycle error message. */
  message: z.string(),
  /** Sanitized stack text. */
  stack: z.string().optional(),
  /** Assertion diff. */
  diff: z.string().optional(),
})])

/** Shared test result projection validated after sanitization, without a second runtime model. */
export const mcpTestSummarySchema: z.ZodType<HistoireTestRunSummary> = z.strictObject({
  /** Aggregate success, including collection errors. */
  ok: z.boolean(),
  /** Number of reported tests. */
  total: z.number().int().nonnegative(),
  /** Passing count. */
  passed: z.number().int().nonnegative(),
  /** Failed count. */
  failed: z.number().int().nonnegative(),
  /** Skipped count. */
  skipped: z.number().int().nonnegative(),
  /** Sanitized suite-level errors. */
  errors: z.array(testErrorSchema),
  /** Sanitized test cases from shared test runner. */
  tests: z.array(z.strictObject({
    id: z.string(),
    name: z.string(),
    fullName: z.string(),
    state: z.enum(['passed', 'failed', 'skipped']),
    errors: z.array(testErrorSchema),
    storyId: mcpIdSchema.optional(),
    variantId: mcpIdSchema.optional(),
  })),
  /** Failed collection never silently becomes a zero-test success. */
  uncollectedStories: z.array(z.strictObject({ relativePath: mcpRelativePathSchema, error: z.string() })).optional(),
})
