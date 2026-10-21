import type { UiAgentStep } from '@histoire/shared'

/** Consecutive agent steps of one family, rendered as one collapsible row. */
export interface ActivityPhase {
  /** First step id; stable while the phase grows. */
  id: string
  /** Phase family. */
  kind: 'explore' | 'edit' | 'run' | 'other'
  /** Row label, e.g. "Explored", "Editing". */
  title: string
  /** Muted detail, e.g. "read 3 files, searched 1 pattern". */
  summary: string
  /** Steps in order. */
  steps: UiAgentStep[]
  /** Lines added over all steps. */
  added: number
  /** Lines removed over all steps. */
  removed: number
  /** Running while any step runs; failed when the last step failed. */
  status: 'running' | 'done' | 'failed'
}

/** Most file names an edit summary lists before "+N". */
const MAX_LISTED_FILES = 3

/** Maps an ACP tool kind to its phase family. */
function phaseKind(kind: UiAgentStep['kind']): ActivityPhase['kind'] {
  if (kind === 'read' || kind === 'search' || kind === 'think' || kind === 'fetch') return 'explore'
  if (kind === 'edit' || kind === 'delete' || kind === 'move') return 'edit'
  if (kind === 'execute') return 'run'
  return 'other'
}

/** Whether a step is still in flight. */
export function isStepRunning(step: UiAgentStep): boolean {
  return step.status === 'pending' || step.status === 'in_progress'
}

/** "2 files" style fragment, singular at 1. */
function count(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

/** Last path segment. */
function basename(file: string): string {
  return file.split('/').findLast(Boolean) ?? file
}

/** Summary of an explore phase: reads, searches/fetches and whether the agent thought. */
function exploreSummary(steps: UiAgentStep[]): string {
  const reads = steps.filter(step => step.kind === 'read').length
  const searches = steps.filter(step => step.kind === 'search' || step.kind === 'fetch').length
  const thought = steps.some(step => step.kind === 'think')
  // Thought-only phases already say "Thinking"/"Thought" in their title.
  if (!reads && !searches) return ''
  return [reads && `read ${count(reads, 'file', 'files')}`, searches && `searched ${count(searches, 'pattern', 'patterns')}`, thought && 'thought'].filter(Boolean).join(', ')
}

/** Edit summary: up to three distinct basenames, then "+N". */
function editSummary(steps: UiAgentStep[]): string {
  const names = [...new Set(steps.flatMap(step => step.target ? [basename(step.target)] : []))]
  const shown = names.slice(0, MAX_LISTED_FILES).join(', ')
  return names.length > MAX_LISTED_FILES ? `${shown} +${names.length - MAX_LISTED_FILES}` : shown
}

/** Row label and detail for a phase. */
function describe(kind: ActivityPhase['kind'], steps: UiAgentStep[], running: boolean): { title: string, summary: string } {
  switch (kind) {
    case 'explore':
      if (steps.every(step => step.kind === 'think')) return { title: running ? 'Thinking' : 'Thought', summary: '' }
      return { title: running ? 'Exploring' : 'Explored', summary: exploreSummary(steps) }
    case 'edit':
      return { title: running ? 'Editing' : 'Edited', summary: editSummary(steps) }
    case 'run':
      return { title: running ? 'Running' : 'Ran', summary: steps.length === 1 ? steps[0].title : count(steps.length, 'command', 'commands') }
    default:
      return { title: steps.length === 1 ? steps[0].title : running ? 'Working' : 'Worked', summary: steps.length === 1 ? '' : count(steps.length, 'step', 'steps') }
  }
}

/**
 * Groups consecutive steps of the same family into phases, in order.
 * @param steps Persisted or live agent steps.
 */
export function groupActivityPhases(steps: readonly UiAgentStep[]): ActivityPhase[] {
  const groups: { kind: ActivityPhase['kind'], steps: UiAgentStep[] }[] = []
  for (const step of steps) {
    const kind = phaseKind(step.kind)
    const last = groups.at(-1)
    if (last?.kind === kind) last.steps.push(step)
    else groups.push({ kind, steps: [step] })
  }
  return groups.map(({ kind, steps }) => {
    const running = steps.some(isStepRunning)
    return {
      id: steps[0].id,
      kind,
      ...describe(kind, steps, running),
      steps,
      added: steps.reduce((sum, step) => sum + (step.added ?? 0), 0),
      removed: steps.reduce((sum, step) => sum + (step.removed ?? 0), 0),
      status: running ? 'running' : steps.at(-1)?.status === 'failed' ? 'failed' : 'done',
    }
  })
}
