import type { LaunchPreviewBrowser } from '../mcp/browser/dependencies.js'
import type { PreviewHostRegistry } from '../mcp/browser/preview-host.js'
import type { McpOperations } from '../mcp/operations/store.js'
import type { McpExecutionCapture } from '../mcp/operations/types.js'
import type { McpToolInput } from '../mcp/protocol/tool-schema.js'
import type { PreviewSessionOptions } from '../runtime/browser/session.js'
import type { NodeArtifact } from './artifact-reader.js'
import type { NodeCatalog } from './catalog.js'
import { createScreenshotTask } from '../mcp/browser/screenshot.js'
import { mcpToolInputSchemas } from '../mcp/protocol/tool-schema.js'

/** Private production authority shared with compiled embedded test executor. */
export interface NodeExecutionValue {
  /** Validated immutable artifact and recorded test deadlines. */
  artifact: NodeArtifact
  /** Exact story/variant authority. */
  catalog: NodeCatalog
  /** Same-origin owned nonce preview host. */
  host: PreviewHostRegistry
  /** Actual loopback listener origin for internal automation. */
  readonly origin: string
}

/** Immutable Node preview authority is shared by screenshots and inspection. */
export function resolveNodePreviewOptions(target: McpToolInput<'histoire_capture_screenshot'>, capture: McpExecutionCapture<NodeExecutionValue>, launch?: LaunchPreviewBrowser): PreviewSessionOptions {
  const { artifact, catalog, host, origin } = capture.value
  catalog.getTarget(target.storyId, target.variantId, capture.revision)
  const manifest = artifact.manifest
  return { root: artifact.root, host, launch, target: { origin, storyId: target.storyId, variantId: target.variantId, epoch: capture.epoch, width: target.width, height: target.height, deviceScaleFactor: target.deviceScaleFactor, globals: target.globals ?? manifest.globals ?? {}, colorScheme: target.colorScheme ?? (manifest.defaultColorScheme === 'auto' ? undefined : manifest.defaultColorScheme), textDirection: target.textDirection, backgroundColor: manifest.backgroundColor, isActive: capture.isActive } }
}

/** Install production screenshot executor without runtime source or Vite imports. */
export function registerNodeScreenshotExecutor(operations: McpOperations<NodeExecutionValue>, launch?: LaunchPreviewBrowser) {
  operations.registerExecutor('screenshot', (input, capture) => {
    const target = mcpToolInputSchemas.histoire_capture_screenshot.parse(input)
    return createScreenshotTask(resolveNodePreviewOptions(target, capture, launch))
  })
}
