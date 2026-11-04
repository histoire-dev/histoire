import type { Context } from '../context.js'
import { availableParallelism, freemem } from 'node:os'
import { DEFAULT_COLLECT_TIMEOUT } from '@histoire/shared'

export { DEFAULT_COLLECT_TIMEOUT } from '@histoire/shared'

/** Default maximum time (ms) a single story may take to load and mount while collecting. */
export const DEFAULT_STORY_COLLECT_TIMEOUT = 30_000

/** Default maximum time (ms) a Histoire test run may go without finishing a spec. */
export const DEFAULT_RUN_STALL_TIMEOUT = 300_000

/** Memory one test worker may need: its headless browser page plus its share of the runner. */
const TEST_WORKER_MEMORY = 1024 ** 3

/**
 * Default concurrent test workers. Every worker drives its own browser page, so the count stays
 * at half the CPUs (leaving room for the dev server) and within the memory available now:
 * running out of it takes down every Chromium-based process on the machine, the user's browser included.
 * @param cpus Host scheduling capacity.
 * @param available Memory available to new processes, in bytes.
 */
export function defaultTestMaxWorkers(cpus = availableParallelism(), available = freemem()) {
  return Math.max(1, Math.min(Math.floor(cpus / 2), Math.floor(available / TEST_WORKER_MEMORY)))
}

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
 * Resolves the stall timeout (ms) of the Histoire test run: how long it may go without
 * finishing a spec. Falls back to the deprecated `test.runTimeout` alias.
 * @param ctx The histoire context.
 */
export function getRunStallTimeout(ctx: Context) {
  return ctx.config?.test?.runStallTimeout ?? ctx.config?.test?.runTimeout ?? DEFAULT_RUN_STALL_TIMEOUT
}

/**
 * Resolves and validates the shared test execution concurrency cap. Without a configured value,
 * the default reads the memory available at each call, so every run fits the machine as it is then.
 * @param ctx The histoire context.
 */
export function getTestMaxWorkers(ctx: Context) {
  const value = ctx.config?.test?.maxWorkers ?? defaultTestMaxWorkers()
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Expected test.maxWorkers to be a positive integer')
  }
  return value
}
