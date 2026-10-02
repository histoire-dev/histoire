import type { createDevMcpOperations } from './dev.js'
import { createHistoireTestTask } from '../../test/execution-service.js'
import { ensureBrowserTestDepsInstalled, ensureProjectVitest } from '../../test/preflight.js'
import { McpDomainError } from '../protocol/errors.js'
import { mcpToolInputSchemas } from '../protocol/tool-schema.js'
import { sanitizeMcpTestSummary } from './test-results.js'

/** Register project-Vitest executor once for HTTP/stdio; never launch resources at admission. */
export function registerDevTestExecutor(operations: ReturnType<typeof createDevMcpOperations>, secret?: string): void {
  operations.registerExecutor('tests', (input, capture) => {
    const target = mcpToolInputSchemas.histoire_run_tests.parse(input)
    const context = capture.value.handle.context
    const task = createHistoireTestTask(context, { storyId: target.storyId, variantId: target.variantId })
    return {
      async run(signal) {
        try {
          ensureProjectVitest(context)
          await ensureBrowserTestDepsInstalled(context.root)
        }
        catch { throw new McpDomainError('DEPENDENCY_MISSING', 'Install vitest, @vitest/browser-playwright and playwright to run browser tests') }
        const summary = await task.run(signal)
        return { result: {
          storyId: target.storyId,
          ...(target.variantId === undefined ? {} : { variantId: target.variantId }),
          engine: 'project-vitest',
          summary: sanitizeMcpTestSummary(summary, { root: context.root, secret }),
          truncated: false,
        } }
      },
      cleanup: task.cleanup,
    }
  })
}
