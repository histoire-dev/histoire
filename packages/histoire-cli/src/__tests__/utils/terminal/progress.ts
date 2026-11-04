import type { ProgressState } from '../../../terminal/progress/state.js'

/**
 * Moves a progress mirror through a normal start of `generation` up to ready, in the order
 * the proxy reports it (`starting`, runtime start, `ready`).
 * @param progress Progress mirror to drive.
 * @param generation Runtime generation that becomes current.
 */
export function readyGeneration(progress: ProgressState, generation: string) {
  progress.onStatus({ status: 'starting' })
  progress.onRuntimeStart({ generation, fresh: false })
  progress.onStatus({ status: 'ready' })
}
