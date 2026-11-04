import type { TerminalCommandHandler } from '../registry.js'
import { parseTestOperationArgs, parseTestResultsArgs, parseTestRunArgs } from '@histoire/cli/protocol/tests'
import { getTestsService } from '../tests/index.js'

/**
 * Handlers of the `tests.*` namespace. Each validates its own untrusted
 * arguments; admission replies with the operation snapshot, never with a
 * result, so a slow browser run cannot hit the read timeout.
 */
export const testHandlers: readonly TerminalCommandHandler[] = [
  {
    operation: 'tests.run',
    async handle(args, context) {
      const { target, expectedRevision } = parseTestRunArgs(args)
      return getTestsService(context).run(target, expectedRevision).operation
    },
  },
  {
    operation: 'tests.get',
    async handle(args, context) {
      return getTestsService(context).get(parseTestOperationArgs(args).operationId)
    },
  },
  {
    operation: 'tests.results',
    async handle(args, context) {
      return getTestsService(context).results(parseTestResultsArgs(args))
    },
  },
  {
    operation: 'tests.cancel',
    async handle(args, context) {
      return getTestsService(context).cancel(parseTestOperationArgs(args).operationId)
    },
  },
]
