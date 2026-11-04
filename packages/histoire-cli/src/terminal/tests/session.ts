import type { TerminalSessionOptions } from '../session-types.js'
import type { SessionWatchOutput } from '../watch/session.js'
import type { TestsConsole } from './console.js'
import { getTestTargetHandoff } from '../stories/handoff.js'
import { attachSessionWatch } from '../watch/session.js'
import { createTestsClient } from './client.js'
import { createTestsConsole } from './console.js'
import { createTestsState } from './state.js'

/**
 * Builds the session's test console and its watch. Operations are observed for the whole
 * session: a caller-provided state (the dev command, which also feeds it runtime retirement)
 * is used as is, otherwise a private one listens to the bridge.
 * @param options Session options (bridge, progress, optional shared state, `testWatch`).
 * @param output Output hooks of the watch; without them the watch is not registered.
 */
export function createSessionTests(options: Pick<TerminalSessionOptions, 'bridge' | 'progress' | 'tests' | 'testWatch'>, output?: SessionWatchOutput): TestsConsole {
  const client = createTestsClient(options.bridge)
  let state = options.tests
  if (!state) {
    state = createTestsState({ client })
    state.attach(options.bridge)
  }
  const tests = createTestsConsole({ state, client, bridge: options.bridge, progress: options.progress, handoff: getTestTargetHandoff({ bridge: options.bridge }) })
  if (output) attachSessionWatch(tests, options, output)
  return tests
}
