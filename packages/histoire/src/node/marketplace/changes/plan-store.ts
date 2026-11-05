import type { ChangeRequest } from '@histoire/shared'
import type { PlannedChange, PlannerOptions } from './planner.js'
import { randomUUID } from 'node:crypto'
import { computePlan, PlanningError } from './planner.js'

export type { PlannedChange, PlannerOptions, PlanningPlugin } from './planner.js'
export { PlanningError } from './planner.js'

/** Owns bounded review capabilities for exactly one dev-server generation. */
export function createPlanStore(options: PlannerOptions) {
  const plans = new Map<string, { /** Original immutable request. */ request: ChangeRequest, /** Reviewed fingerprint. */ hash: string, /** Absolute expiry timestamp. */ expires: number }>()
  const now = options.now ?? Date.now
  let retired = false
  /** Reclaims expired records before either admission or verification. */
  function prune(): void {
    for (const [id, record] of plans) {
      if (record.expires <= now()) plans.delete(id)
    }
  }
  /** Returns a private planned change so decorators need no admission recompute. */
  async function planChange(request: ChangeRequest): Promise<PlannedChange> {
    if (retired) throw new PlanningError('stale', 'Plugin change generation retired')
    prune()
    const result = await computePlan(options, request)
    if (retired) throw new PlanningError('stale', 'Plugin change generation retired')
    result.plan.planId = randomUUID()
    // Evict oldest reviews when a client repeatedly changes form values.
    if (plans.size >= 100) plans.delete(plans.keys().next().value)
    plans.set(result.plan.planId, { request: structuredClone(result.request), hash: result.plan.hash, expires: now() + 15 * 60 * 1000 })
    return result
  }
  /** Checks capability lifetime again after asynchronous decorator work. */
  function checkPlan(planId: string, hash: string): void {
    prune()
    if (retired) throw new PlanningError('stale', 'Plugin change generation retired')
    const record = plans.get(planId)
    if (!record || record.hash !== hash) throw new PlanningError('stale', 'Plugin change plan expired or changed')
  }
  return {
    planChange,
    checkPlan,
    /** Stores a read-only plan; caller mutation cannot alter later admission. */
    async plan(request: ChangeRequest) {
      return (await planChange(request)).plan
    },
    /** Recomputes from disk and metadata before granting private execution input. */
    async verifyPlan(planId: string, hash: string): Promise<PlannedChange> {
      checkPlan(planId, hash)
      const stored = plans.get(planId)!
      const current = await computePlan(options, stored.request)
      checkPlan(planId, hash)
      if (current.plan.hash !== hash) throw new PlanningError('stale', 'Project changed. Review plugin changes again')
      if (current.plan.manual) throw new PlanningError('unavailable', 'This change needs manual steps')
      current.plan.planId = planId
      return current
    },
    /** Retires every capability when its runtime generation closes. */
    clear(): void {
      retired = true
      plans.clear()
    },
  }
}
