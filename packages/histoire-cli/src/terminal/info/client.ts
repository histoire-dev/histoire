import type { TerminalBridge } from '../bridge.js'
import type { ProgressState } from '../progress/state.js'
import type { SessionInfoDto } from '../protocol/session.js'
import { isSessionInfo } from '../protocol/session.js'
import { createGenerationClient } from './generation-client.js'

/** Runtime-provided session facts for the generation that is current right now. */
export interface SessionInfoClient {
  /** Reply for the current generation, or why there is none. Never an earlier generation's reply. */
  current: () => { info?: SessionInfoDto, problem?: string }
  /** Asks the current runtime again; resolves when the answer (or failure) has been recorded. */
  refresh: () => Promise<void>
}

/**
 * Creates the typed `session.get` wrapper over the generation-tagged client.
 * @param bridge Command bridge.
 * @param progress Progress mirror (current generation and readiness).
 * @param changed Called when a reply or failure was recorded (repaint).
 */
export function createSessionInfoClient(bridge: TerminalBridge, progress: ProgressState, changed: () => void): SessionInfoClient {
  const client = createGenerationClient<SessionInfoDto>({
    read: () => bridge.send('session.get', {}),
    validate: isSessionInfo,
    progress,
    changed,
    unusable: 'Runtime sent unusable session details',
    unavailable: 'Runtime details unavailable',
  })
  return {
    current() {
      const { value, problem } = client.current()
      return { info: value, problem }
    },
    refresh: client.refresh,
  }
}
