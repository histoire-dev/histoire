import type { TerminalSessionOptions } from '../session-types.js'
import type { TestsConsole } from '../tests/console.js'
import { createWatchClient } from './client.js'
import { createWatchController } from './controller.js'

/** Output hooks the session supplies. */
export interface SessionWatchOutput {
  /** Prints one line (plain mode) or shows transient feedback (TUI). */
  report: (line: string) => void
  /** Whether the session is in plain output mode. */
  plain: () => boolean
}

/**
 * Registers the watch with the session's test console: `w`, plain `watch`, the stop hook
 * and the panel text. `--test-watch` starts with the whole book and needs no input.
 * @param tests Session test console.
 * @param options Bridge, progress mirror and the `testWatch` flag.
 * @param output Session output hooks.
 */
export function attachSessionWatch(tests: TestsConsole, options: Pick<TerminalSessionOptions, 'bridge' | 'progress' | 'testWatch'>, output: SessionWatchOutput) {
  createWatchController({ bridge: options.bridge, client: createWatchClient(options.bridge), progress: options.progress, tests, initial: options.testWatch === true, ...output })
}
