import type { PreviewSessionOptions } from '../../runtime/browser/session.js'
import type { ExecutionTask } from '../../runtime/execution-types.js'
import type { McpOperationOutput } from '../operations/types.js'
import { createScreenshotTask as createRuntimeScreenshotTask } from '../../runtime/browser/screenshot.js'

export { readPngDimensions } from '../../runtime/browser/png.js'

/** Thin transport projection; browser acquisition and teardown stay shared. */
export function createScreenshotTask(options: PreviewSessionOptions): ExecutionTask<McpOperationOutput> {
  const task = createRuntimeScreenshotTask(options)
  return { ...task, async run(signal) {
    const output = await task.run(signal)
    return { ...output, result: { ...output.result, artifactUri: '' } }
  } }
}
