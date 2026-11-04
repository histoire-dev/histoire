import type { TerminalBridge } from '../bridge.js'
import type { WatchSetArgs, WatchStateDto } from '../protocol/watch.js'

/** Typed wrapper of the `watch.*` operations. */
export interface WatchClient {
  /** Enables, retargets or disables watching in the current generation; idempotent. */
  set: (args: WatchSetArgs) => Promise<WatchStateDto>
}

/**
 * Creates the typed client. Pure sugar over `bridge.send`; holds no state.
 * @param bridge Parent bridge (or any object with a compatible `send`).
 */
export function createWatchClient(bridge: Pick<TerminalBridge, 'send'>): WatchClient {
  return { set: args => bridge.send('watch.set', args) }
}
