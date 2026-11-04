import type { TerminalBridge } from '../bridge.js'
import type { GenerationClient } from '../info/generation-client.js'
import type { ProgressState } from '../progress/state.js'
import type { DiagnosticsDto } from '../protocol/diagnostics.js'
import { createGenerationClient } from '../info/generation-client.js'
import { isDiagnostics } from '../protocol/diagnostics.js'

/**
 * Typed `diagnostics.get` wrapper. The reply is tagged with the generation it was requested
 * for and hidden once another generation is current, so diagnostics stay generation-owned.
 * @param bridge Command bridge.
 * @param progress Progress mirror.
 * @param changed Called when a reply or failure was recorded (repaint).
 */
export function createDiagnosticsClient(bridge: TerminalBridge, progress: ProgressState, changed: () => void): GenerationClient<DiagnosticsDto> {
  return createGenerationClient<DiagnosticsDto>({
    read: () => bridge.send('diagnostics.get', {}),
    validate: isDiagnostics,
    progress,
    changed,
    unusable: 'Runtime sent unusable diagnostics',
    unavailable: 'Diagnostics unavailable',
  })
}
