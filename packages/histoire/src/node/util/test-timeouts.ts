import type { Context } from '../context.js'

/** Default maximum time (ms) to wait for the browser story collection run. */
export const DEFAULT_COLLECT_TIMEOUT = 120_000

/** Default maximum time (ms) a single story may take to load and mount while collecting. */
export const DEFAULT_STORY_COLLECT_TIMEOUT = 30_000

/** Default maximum time (ms) to wait for the Histoire test run. */
export const DEFAULT_RUN_TIMEOUT = 300_000

/** Maximum time (ms) to wait for Vitest cleanup before giving up on it. */
export const CLEANUP_TIMEOUT = 10_000

/**
 * Resolves the safety timeout (ms) of the browser story collection run.
 * Large projects need more than the default, so it is configurable.
 * @param ctx The histoire context.
 */
export function getCollectTimeout(ctx: Context) {
  return ctx.config?.test?.collectTimeout ?? DEFAULT_COLLECT_TIMEOUT
}

/**
 * Resolves the per-story timeout (ms) applied while collecting in the browser.
 *
 * Deliberately much shorter than {@link getCollectTimeout}: it fails a single
 * broken story instead of letting it stall the whole collection batch.
 * @param ctx The histoire context.
 */
export function getStoryCollectTimeout(ctx: Context) {
  return ctx.config?.test?.storyCollectTimeout ?? DEFAULT_STORY_COLLECT_TIMEOUT
}

/**
 * Resolves the safety timeout (ms) of the Histoire test run.
 * @param ctx The histoire context.
 */
export function getRunTimeout(ctx: Context) {
  return ctx.config?.test?.runTimeout ?? DEFAULT_RUN_TIMEOUT
}
