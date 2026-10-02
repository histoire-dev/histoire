import type { createDevMcpOperations } from '../operations/dev.js'
import { getDevPreviewHost } from '../../vite/mcp-preview-html.js'
import { McpDomainError } from '../protocol/errors.js'
import { mcpToolInputSchemas } from '../protocol/tool-schema.js'
import { createScreenshotTask } from './screenshot.js'

/** Install one concrete executor shared by HTTP and stdio project workers. */
export function registerDevScreenshotExecutor(operations: ReturnType<typeof createDevMcpOperations>): void {
  operations.registerExecutor('screenshot', (input, capture) => {
    const target = mcpToolInputSchemas.histoire_capture_screenshot.parse(input)
    const { handle, catalog } = capture.value
    catalog.getTarget(target.storyId, target.variantId, capture.revision)
    const address = handle.server.resolvedUrls?.local[0]
    if (!address) throw new McpDomainError('PREVIEW_NOT_READY', 'Loopback preview server is unavailable', true)
    const config = handle.context.config
    return createScreenshotTask({ root: handle.context.root, host: getDevPreviewHost(handle.server), target: { origin: new URL(address).origin, storyId: target.storyId, variantId: target.variantId, epoch: capture.epoch, width: target.width, height: target.height, colorScheme: target.colorScheme ?? (config.theme.defaultColorScheme === 'auto' ? undefined : config.theme.defaultColorScheme), textDirection: target.textDirection, backgroundColor: config.backgroundPresets?.[0]?.color ?? 'transparent', isActive: capture.isActive } })
  })
}
