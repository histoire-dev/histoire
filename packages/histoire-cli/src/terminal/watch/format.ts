import type { TestTarget } from '../protocol/tests.js'
import type { WatchStateDto } from '../protocol/watch.js'
import { sanitizeText } from '../output/sanitize.js'
import { describeTarget } from '../tests/format.js'

/** Whether two exact scopes name the same target. */
export function sameScope(left: TestTarget, right: TestTarget): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Short word for the main panel. */
export function describeWatchSegment(state: WatchStateDto | undefined): string {
  return `watch ${state && state.phase !== 'off' ? state.phase : 'starting'}`
}

/** State of the scheduler in words (reason included), for the tests screen. */
export function describePhase(state: WatchStateDto): string {
  const reason = state.reason ? `: ${sanitizeText(state.reason)}` : ''
  switch (state.phase) {
    case 'off': return 'starting'
    case 'idle': return 'waiting for changes'
    case 'waiting': return `waiting${reason}`
    case 'running': return 'running'
    case 'paused': return `paused${reason}`
  }
}

/**
 * Plain-output line announcing a watch state, or undefined when nothing is worth saying.
 * @param state Latest state.
 * @param scope Watched scope.
 * @param running What the current run executes, when known (affected stories differ from the scope).
 */
export function describeWatchLine(state: WatchStateDto, scope: TestTarget, running?: string): string | undefined {
  const target = describeTarget(scope)
  switch (state.phase) {
    case 'off': return undefined
    case 'idle': return `Watch: waiting for changes in ${target}`
    case 'waiting': return `Watch: waiting${state.reason ? `, ${sanitizeText(state.reason).replace(/^\w/, letter => letter.toLowerCase())}` : ''}`
    case 'running': return `Watch: running ${running ?? target}`
    case 'paused': return `Watch paused: ${sanitizeText(state.reason ?? 'needs attention')}`
  }
}
