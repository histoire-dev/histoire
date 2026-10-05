import type { createDevMcpOperations } from '../../operations/dev.js'
import { MCP_INSPECTION_TOOLS, mcpInspectionInputSchemas } from '../../protocol/inspection-schema.js'
import { resolveDevPreviewOptions } from '../dev.js'
import { createInspectionTask } from './task.js'

/** Install fixed inspection executors for dev HTTP and owned stdio workers. */
export function registerDevInspectionExecutors(operations: ReturnType<typeof createDevMcpOperations>, secret?: string): void {
  for (const kind of Object.keys(MCP_INSPECTION_TOOLS) as (keyof typeof MCP_INSPECTION_TOOLS)[]) {
    operations.registerExecutor(kind, (input, capture) => {
      const target = mcpInspectionInputSchemas[MCP_INSPECTION_TOOLS[kind]].parse(input)
      const options = resolveDevPreviewOptions(target, capture)
      return createInspectionTask(kind, target, options, { root: options.root, secret })
    })
  }
}
