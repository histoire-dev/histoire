import type { Plugin } from 'vite'
import type { Context } from '../../context.js'
import type { CollectionModuleAnalysis } from './analysis.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { analyzeCollectionModule } from './analysis.js'

/** Proof transforms stop before browser-only URL rewriting; concurrent HTTP requests remain untouched. */
const proofTransform = new AsyncLocalStorage<{ ctx: Context, id: string, complete: Error, code?: string }>()
/** Reuse actual client transforms; retain parsed capability only, never collection results or module code. */
const analyses = new WeakMap<Context, { ordinary: boolean, modules: Map<string, CollectionModuleAnalysis> }>()

/** A captured object acts as generation token while transforms await user plugins. */
function current(ctx: Context) {
  let state = analyses.get(ctx)
  if (!state) {
    state = { ordinary: true, modules: new Map() }
    analyses.set(ctx, state)
  }
  return state
}

/** Dependency and plugin changes revoke transformed capability alongside resolved graph proofs. */
export function retireCollectionTransforms(ctx: Context): void {
  // Served transforms can finish after HMR from retired bytes. Following the
  // first edit, only an explicitly captured proof transform may fill this cache.
  analyses.set(ctx, { ordinary: false, modules: new Map() })
}

/** Store only the same pre-import-analysis output inspected by isolated proof transforms. */
function remember(ctx: Context, id: string, code: string, state = current(ctx)): CollectionModuleAnalysis {
  const analysis = analyzeCollectionModule(code)
  if (analyses.get(ctx) === state) state.modules.set(id, analysis)
  return analysis
}

/** Capture user/plugin output without evaluating it or changing the served module. */
export function collectionEligibilityTransformPlugin(ctx: Context): Plugin {
  return {
    name: 'histoire-test-eligibility-transforms',
    enforce: 'post',
    transform(code, id) {
      const proof = proofTransform.getStore()
      if (proof?.ctx === ctx && proof.id === id) {
        proof.code = code
        throw proof.complete
      }
      if (current(ctx).ordinary) remember(ctx, id, code)
    },
  }
}

/** Run the same client transforms, stopping at captured user output rather than optimizer transport. */
export async function transformCollectionEligibility(ctx: Context, id: string, transform: () => Promise<unknown>): Promise<CollectionModuleAnalysis | undefined> {
  const state = current(ctx)
  const cached = state.modules.get(id)
  if (cached) return cached
  const complete = new Error('Collection eligibility transform complete')
  const proof: NonNullable<ReturnType<typeof proofTransform.getStore>> = { ctx, id, complete }
  try {
    await proofTransform.run(proof, transform)
  }
  catch (error) { if (error !== complete) throw error }
  return proof.code === undefined ? undefined : remember(ctx, id, proof.code, state)
}
