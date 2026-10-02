import type { McpExecutionCapture, McpOperationOutput } from '../../../mcp/operations/types.js'
import { createMcpOperations } from '../../../mcp/operations/store.js'
import { McpDomainError } from '../../../mcp/protocol/errors.js'
import { mcpToolInputSchemas } from '../../../mcp/protocol/tool-schema.js'

/** Valid lifetime identity shared by operation behavior tests. */
export const OPERATION_EPOCH = '123e4567-e89b-42d3-a456-426614174000'
/** Valid distinct runtime lifetime. */
export const NEXT_OPERATION_EPOCH = '123e4567-e89b-42d3-a456-426614174001'

/** Controlled project metadata/execution capture without Vite or project modules. */
export function operationFixture(projectId = 'project_test') {
  const current = { epoch: OPERATION_EPOCH, revision: `${OPERATION_EPOCH}:1`, active: true }
  const operations = createMcpOperations({
    capture(): McpExecutionCapture<null> {
      const epoch = current.epoch
      const revision = current.revision
      return {
        projectId,
        epoch,
        revision,
        value: null,
        isActive: () => current.active && current.epoch === epoch,
        validate(input) {
          if (input.expectedRevision && input.expectedRevision !== current.revision) throw new McpDomainError('STALE_REVISION', 'Catalog revision changed')
        },
      }
    },
  })
  return { operations, current }
}

/** Parsed request defaults are the same normalization used by SDK starters. */
export function testOperationInput(requestKey: string, storyId = 'story', variantId = 'variant') {
  return mcpToolInputSchemas.histoire_run_tests.parse({ requestKey, storyId, variantId })
}

/** Real shared result projection, without assertions about presentation fields. */
export function testOperationOutput(storyId = 'story', variantId = 'variant'): McpOperationOutput {
  return { result: { storyId, variantId, engine: 'project-vitest', truncated: false, summary: { ok: true, total: 1, passed: 1, failed: 0, skipped: 0, errors: [], tests: [{ id: variantId, name: variantId, fullName: `${storyId} ${variantId}`, state: 'passed', errors: [], storyId, variantId }] } } }
}
