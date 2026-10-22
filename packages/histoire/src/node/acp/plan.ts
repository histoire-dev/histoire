import type { PlanEntry } from '@agentclientprotocol/sdk'
import type { UiAgentPlanEntry } from '@histoire/shared'

/** Entries kept per plan; agents rarely report more. */
export const PLAN_ENTRY_LIMIT = 50
/** Visible length kept per entry. */
const CONTENT_LIMIT = 300
/** ACP entry statuses; anything else is treated as pending. */
const STATUSES = new Set<UiAgentPlanEntry['status']>(['pending', 'in_progress', 'completed'])
/** ACP entry priorities; anything else is dropped. */
const PRIORITIES = new Set<NonNullable<UiAgentPlanEntry['priority']>>(['high', 'medium', 'low'])

/**
 * Projects one ACP plan update into bounded, redacted UI entries.
 * @param entries Complete agent plan; ACP sends the whole list on each update.
 * @param sanitize Redacts known secrets.
 */
export function projectAgentPlan(entries: readonly PlanEntry[], sanitize: (text: string) => string): UiAgentPlanEntry[] {
  return entries.slice(0, PLAN_ENTRY_LIMIT).filter(entry => typeof entry?.content === 'string').map((entry) => {
    const status = STATUSES.has(entry.status) ? entry.status : 'pending'
    const priority = PRIORITIES.has(entry.priority) ? entry.priority : undefined
    return { content: sanitize(entry.content).slice(0, CONTENT_LIMIT), status, ...priority ? { priority } : {} }
  })
}
