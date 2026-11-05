import type { ChangeRequest, MigrationOp } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { createPlanStore, PlannedChange, PlannerOptions } from '../changes/plan-store.js'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { compareVersions } from '../catalog/version.js'
import { fileDiff } from '../changes/diff.js'
import { manualPlan } from '../changes/manual.js'
import { PlanningError } from '../changes/planner.js'
import { projectPluginResolver } from '../changes/resolve-plugin.js'
import { changeRequestSchema } from '../changes/validation.js'
import { applyMigrations } from './apply.js'
import { installedVersion, readReleases } from './releases.js'
import { selectMigrations } from './select.js'

/** Resolve migration input without executing package code or mutating project files. */
export async function planMigrations(ctx: Pick<Context, 'root'>, request: ChangeRequest, resolvePlugin: PlannerOptions['resolvePlugin'] = projectPluginResolver(ctx)) {
  const from = await installedVersion(ctx.root, request.id)
  const target = await resolvePlugin(request)
  const to = request.version ?? target.version
  const history = await readReleases(ctx, request.id, request.prefs, true)
  const releases = history.filter(item => item.latest !== to).map(item => ({ version: item.latest, manifest: item.manifest }))
  releases.push({ version: to, manifest: target.manifest })
  return { from, to, ops: selectMigrations(releases, from, to) }
}

/** Plain manual instructions identify each refused edit rather than offering executable code. */
function migrationStep(op: MigrationOp) {
  return { title: op.op === 'rename-option' ? `Rename ${op.from} to ${op.to}` : op.op === 'remove-option' ? `Remove ${op.path}` : `Set ${op.path}`, ...(op.op === 'set-option' ? { code: JSON.stringify(op.value) } : {}) }
}

/** Add migrations to existing review capabilities while retaining their expiry and disk guards. */
export function withMigrations(ctx: Context, base: ReturnType<typeof createPlanStore>, options: PlannerOptions): ReturnType<typeof createPlanStore> {
  const records = new Map<string, { /** Underlying freshly verified review. */ baseHash: string, /** Migration-aware review hash. */ hash: string, /** Reviewed intent. */ request: ChangeRequest }>()
  let retired = false
  /** Recompute migration source and bind exact output plus installed revision to review. */
  async function decorate(change: PlannedChange, request: ChangeRequest): Promise<PlannedChange> {
    const migration = await planMigrations(ctx, request, options.resolvePlugin)
    const plan = change.plan
    change.request = { ...change.request, migrate: true }
    if (compareVersions(migration.to, migration.from) <= 0) plan.warnings.push('Downgrades do not apply config migrations')
    try {
      const before = await readFile(options.configFile!, 'utf8')
      change.configCode = applyMigrations(change.configCode!, request.id, change.manifest, migration.ops)
      const file = path.relative(options.root, options.configFile!)
      plan.files = plan.files.filter(item => item.path !== file)
      if (change.configCode !== before) plan.files.unshift(fileDiff(file, before, change.configCode))
    }
    catch {
      plan.manual = manualPlan('migration-manual', request, change.manifest)
      plan.files = []
      delete plan.command
      delete change.configCode
    }
    if (plan.manual) plan.manual.steps.push(...migration.ops.map(migrationStep))
    plan.hash = createHash('sha256').update(JSON.stringify({ base: plan.hash, migration, configCode: change.configCode, manual: plan.manual, files: plan.files })).digest('hex')
    if (retired) throw new PlanningError('stale', 'Plugin change generation retired')
    return change
  }
  return {
    ...base,
    /** Ordinary changes use the original planner unchanged. */
    async plan(request) {
      if (request.kind !== 'update' || !request.migrate || options.static) return base.plan(request)
      const reviewed = changeRequestSchema.safeParse(request)
      if (!reviewed.success) throw new PlanningError('invalid', 'Invalid plugin change')
      const plain = { ...reviewed.data, migrate: false }
      const change = await base.planChange(plain)
      const plan = change.plan
      // Preserve base planner's manual classification; migration execution cannot
      // grant a capability the underlying config/package planner refused.
      if (plan.manual) return plan
      const baseHash = plan.hash
      await decorate(change, reviewed.data)
      base.checkPlan(plan.planId, baseHash)
      if (records.size >= 100) records.delete(records.keys().next().value)
      records.set(plan.planId, { baseHash, hash: change.plan.hash, request: reviewed.data })
      return change.plan
    },
    /** Fresh base verification precedes fresh metadata and exact migration hash comparison. */
    async verifyPlan(planId, hash) {
      const record = records.get(planId)
      if (!record) return base.verifyPlan(planId, hash)
      if (record.hash !== hash) throw new PlanningError('stale', 'Plugin change plan expired or changed')
      const change = await decorate(await base.verifyPlan(planId, record.baseHash), record.request)
      // Metadata work can outlive a review or its generation. Check the original
      // capability without repeating filesystem planning and metadata resolution.
      base.checkPlan(planId, record.baseHash)
      if (records.get(planId) !== record) throw new PlanningError('stale', 'Plugin change plan expired or changed')
      if (change.plan.hash !== hash) throw new PlanningError('stale', 'Project changed. Review plugin changes again')
      if (change.plan.manual) throw new PlanningError('unavailable', 'This change needs manual steps')
      return change
    },
    /** Retire both base capabilities and migration metadata on generation cleanup. */
    clear() {
      retired = true
      records.clear()
      base.clear()
    },
  }
}
