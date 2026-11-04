import type { TerminalBridge } from '../bridge.js'
import type { TestOperationDto, TestResultsArgs, TestResultsPage, TestTarget } from '../protocol/tests.js'

/** Typed wrappers of the `tests.*` operations over the generic bridge. */
export interface TestsClient {
  /**
   * Admits a run; settles with the operation snapshot right after admission.
   * A timeout means admission is unknown and is never retried automatically.
   */
  run: (target: TestTarget, expectedRevision?: string) => Promise<TestOperationDto>
  /** Reads one operation's snapshot. */
  get: (operationId: string) => Promise<TestOperationDto>
  /** Reads one page of retained cases. */
  results: (args: TestResultsArgs) => Promise<TestResultsPage>
  /** Requests cancellation of exactly this operation; the state stays `cancelling` until cleanup. */
  cancel: (operationId: string) => Promise<TestOperationDto>
}

/**
 * Creates the typed client. Pure sugar over `bridge.send`; holds no state.
 * @param bridge Parent bridge (or any object with a compatible `send`).
 */
export function createTestsClient(bridge: Pick<TerminalBridge, 'send'>): TestsClient {
  return {
    run: (target, expectedRevision) => bridge.send('tests.run', { target, ...(expectedRevision === undefined ? {} : { expectedRevision }) }),
    get: operationId => bridge.send('tests.get', { operationId }),
    results: args => bridge.send('tests.results', args),
    cancel: operationId => bridge.send('tests.cancel', { operationId }),
  }
}
