import type { NodeExecutionValue } from '../../../deploy/execution.js'
import type { LaunchPreviewBrowser } from '../../../runtime/browser/dependencies.js'
import type { McpOperations } from '../../operations/store.js'
import { resolveNodePreviewOptions } from '../../../deploy/execution.js'
import { MCP_INSPECTION_TOOLS, mcpInspectionInputSchemas } from '../../protocol/inspection-schema.js'
import { createInspectionTask } from './task.js'

/** Immutable deployment needs only optional Playwright, never project source discovery. */
export function registerNodeInspectionExecutors(operations: McpOperations<NodeExecutionValue>, launch?: LaunchPreviewBrowser, secret?: string): void {
  for (const kind of Object.keys(MCP_INSPECTION_TOOLS) as (keyof typeof MCP_INSPECTION_TOOLS)[]) {
    operations.registerExecutor(kind, (input, capture) => {
      const target = mcpInspectionInputSchemas[MCP_INSPECTION_TOOLS[kind]].parse(input)
      const options = resolveNodePreviewOptions(target, capture, launch)
      return createInspectionTask(kind, target, options, { root: options.root, secret })
    })
  }
}
