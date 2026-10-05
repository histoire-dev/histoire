import type { HistoireBuildOptions, HistoireBuildResult } from './types.js'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from '../build/index.js'
import { resolveBuildTarget } from '../build/node/target.js'
import { closeContext, createContext } from '../context.js'
import { hasUnconfirmedCleanup } from '../runtime/cleanup.js'
import { claimOutput } from './output-ownership.js'

/** Uses existing build target/hooks with fresh root-owned context and output claim. */
export async function buildProject(root: string, configFile: string | undefined, options: HistoireBuildOptions = {}): Promise<HistoireBuildResult> {
  const context = await createContext({ root, configFile, mode: 'build' })
  let release: (() => void) | undefined
  let failure: unknown
  let failed = false
  let result: HistoireBuildResult
  try {
    if (options.outDir !== undefined) context.config.outDir = resolve(root, options.outDir)
    release = await claimOutput(context.config.outDir, 'build')
    const target = resolveBuildTarget(context.config)
    await build(context, { nodeEntryFile: fileURLToPath(new URL('../deploy/entry.js', import.meta.url)), middlewareMode: true })
    result = { outDir: context.config.outDir, target }
  }
  catch (error) {
    failure = error
    failed = true
  }
  try {
    await closeContext(context)
  }
  catch (cleanupError) {
    // Output ownership stays claimed when resource release cannot be confirmed.
    throw failed ? new AggregateError([failure, cleanupError], String(failure)) : cleanupError
  }
  if (!hasUnconfirmedCleanup(failure)) release?.()
  if (failed) throw failure
  return result
}
