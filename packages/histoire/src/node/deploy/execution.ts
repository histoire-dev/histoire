import type { LaunchPreviewBrowser } from '../mcp/browser/dependencies.js'
import type { PreviewHostRegistry } from '../mcp/browser/preview-host.js'
import type { McpOperations } from '../mcp/operations/store.js'
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

/** Install production screenshot executor without runtime source or Vite imports. */
export function registerNodeScreenshotExecutor(operations: McpOperations<NodeExecutionValue>, launch?: LaunchPreviewBrowser) {
  operations.registerExecutor('screenshot', (input, capture) => {
    const target = mcpToolInputSchemas.histoire_capture_screenshot.parse(input)
    const { artifact, catalog, host, origin } = capture.value
    catalog.getTarget(target.storyId, target.variantId, capture.revision)
    const manifest = artifact.manifest
    return createScreenshotTask({ root: artifact.root, host, launch, target: { origin, storyId: target.storyId, variantId: target.variantId, epoch: capture.epoch, width: target.width, height: target.height, colorScheme: target.colorScheme ?? (manifest.defaultColorScheme === 'auto' ? undefined : manifest.defaultColorScheme), textDirection: target.textDirection, backgroundColor: manifest.backgroundColor, isActive: capture.isActive } })
  })
}
