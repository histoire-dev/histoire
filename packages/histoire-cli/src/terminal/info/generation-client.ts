import type { ProgressState } from '../progress/state.js'

/** Runtime-provided value for the generation that is current right now. */
export interface GenerationClient<T> {
  /** Reply for the current generation, or why there is none. Never an earlier generation's reply. */
  current: () => { value?: T, problem?: string }
  /** Asks the current runtime again; resolves when the answer (or failure) has been recorded. */
  refresh: () => Promise<void>
}

/** Inputs of {@link createGenerationClient}. */
export interface GenerationClientOptions<T> {
  /** Performs the bridge read. */
  read: () => Promise<unknown>
  /** Validates the untrusted reply; anything else is discarded. */
  validate: (value: unknown) => value is T
  /** Progress mirror (current generation and readiness). */
  progress: ProgressState
  /** Called when a reply or failure was recorded (repaint). */
  changed: () => void
  /** Problem text for an unusable reply. */
  unusable: string
  /** Prefix of the problem text for a failed read; the failure message follows. */
  unavailable: string
}

/**
 * Creates a generation-tagged read: the reply is stored with the generation it was
 * requested for and is hidden as soon as the progress state moves to another one, so a
 * retired runtime's answer is never shown as current.
 * @param options Read, validation and wording.
 */
export function createGenerationClient<T>(options: GenerationClientOptions<T>): GenerationClient<T> {
  const { progress } = options
  let stored: { generation: string, value?: T, problem?: string } | undefined
  return {
    current() {
      const { generation, status } = progress.snapshot()
      if (!generation || status !== 'ready') return { problem: status === 'ready' ? 'Waiting for the runtime' : undefined }
      return stored?.generation === generation ? { value: stored.value, problem: stored.problem } : {}
    },
    async refresh() {
      const { generation, status } = progress.snapshot()
      if (!generation || status !== 'ready') return
      try {
        const value = await options.read()
        stored = options.validate(value) ? { generation, value } : { generation, problem: options.unusable }
      }
      catch (error) {
        stored = { generation, problem: `${options.unavailable}: ${error instanceof Error ? error.message : String(error)}` }
      }
      // A reply that arrives after a restart belongs to a retired generation: dropped by `current`.
      options.changed()
    },
  }
}
