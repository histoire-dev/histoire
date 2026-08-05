import type { HistoireTestRegistration } from '@histoire/shared'
import { getStoryExecutionId } from '@histoire/shared'

/** One execution of a story's setup and the registrations it emitted. */
export interface RegistrationGroup {
  /**
   * Id of the story-setup execution, or `undefined` for untagged registrations
   * (a module-scope `onTest(...)`, or a support plugin that does not mark its
   * mounts), which are grouped by mount phase instead.
   */
  executionId: number | undefined
  registrations: HistoireTestRegistration[]
}

/**
 * Splits the mount-phase registration lists into one group per execution of the
 * story setup, dropping registrations that were already captured by an earlier
 * phase (a registration function shared across phases must still run only once).
 *
 * A group has to mean "one execution of the story setup" for the occurrence-aware
 * deduplication downstream to work: it keeps repeats WITHIN a group (genuinely
 * loop-generated tests) and collapses repeats ACROSS groups (the same setup
 * mounted again). Mount phases are NOT a safe proxy for executions — the ambient
 * registry is a process-wide global, so any story mount happening elsewhere in
 * the page while a phase's window is open (the preview iframe renders its own
 * live copy of the story) lands in that phase's list too, and its tests would
 * be counted as loop-generated repeats.
 *
 * Registrations tagged by {@link getStoryExecutionId} are therefore regrouped by
 * their execution; untagged ones (a module-scope `onTest(...)`, or a support
 * plugin that does not mark its mounts) keep their phase as the group, which is
 * the previous behaviour.
 *
 * Groups keep first-appearance order, so the render mount's execution stays the
 * last group of the story's own mounts and its handlers win the dedupe.
 * @param groups Registration lists, ordered by mount phase.
 * @returns One group per execution, in first-appearance order.
 */
export function groupRegistrationsByExecution(groups: HistoireTestRegistration[][]): RegistrationGroup[] {
  const seen = new Set<HistoireTestRegistration>()
  const groupsByKey = new Map<string, RegistrationGroup>()
  const result: RegistrationGroup[] = []

  groups.forEach((group, phaseIndex) => {
    for (const registration of group) {
      if (seen.has(registration)) {
        continue
      }
      seen.add(registration)

      const executionId = getStoryExecutionId(registration)
      const key = executionId === undefined ? `phase:${phaseIndex}` : `execution:${executionId}`
      let target = groupsByKey.get(key)

      if (!target) {
        target = { executionId, registrations: [] }
        groupsByKey.set(key, target)
        result.push(target)
      }

      target.registrations.push(registration)
    }
  })

  return result
}
