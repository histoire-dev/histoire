import type { Context } from '../context.js'
import { getHistoireBrowserRunConfig } from '../vitest-browser-config/run-config.js'

/**
 * Builds the Vitest browser config of a Histoire test run.
 * @param ctx The histoire context.
 * @param entries The generated specs, used as dependency optimizer entries.
 */
export async function getTestVitestConfig(ctx: Context, entries: string[]) {
  return getHistoireBrowserRunConfig(ctx, {
    collecting: false,
    entries,
  })
}
