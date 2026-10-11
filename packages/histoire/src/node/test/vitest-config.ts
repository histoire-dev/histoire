import type { Plugin } from 'vite'
import type { Context } from '../context.js'
import { getHistoireBrowserRunConfig } from '../vitest-browser-config/run-config.js'

/**
 * Builds the Vitest browser config of a Histoire test run.
 * @param ctx The histoire context.
 * @param entries The generated specs, used as dependency optimizer entries.
 * @param mode Definition discovery or fresh assertion execution.
 * @param plugins Attempt-owned result transport plugins.
 * @param collectionOptimizerEntries Private captured catalog roots, independent of mounted targets.
 */
export async function getTestVitestConfig(ctx: Context, entries: string[], mode: 'run' | 'definitions' = 'run', plugins: Plugin[] = [], collectionOptimizerEntries?: string[]) {
  return getHistoireBrowserRunConfig(ctx, {
    collecting: false,
    entries,
    definitions: mode === 'definitions',
    plugins,
    collectionOptimizerEntries,
  })
}
