import type { PreviewSessionOptions } from '../../runtime/browser/session.js'
import type { createDevMcpOperations } from '../operations/dev.js'
import type { McpToolInput } from '../protocol/tool-schema.js'
import { getDevPreviewHost } from '../../vite/mcp-preview-html.js'
import { McpDomainError } from '../protocol/errors.js'
import { mcpToolInputSchemas } from '../protocol/tool-schema.js'
import { createScreenshotTask } from './screenshot.js'

/** Exact private dev capture accepted by the existing operation service. */
type DevCapture = Parameters<Parameters<ReturnType<typeof createDevMcpOperations>['registerExecutor']>[1]>[1]

/** Shared dev target resolution keeps capture and inspection appearance identical. */
export function resolveDevPreviewOptions(target: McpToolInput<'histoire_capture_screenshot'>, capture: DevCapture): PreviewSessionOptions {
  const { handle, catalog } = capture.value
  catalog.getTarget(target.storyId, target.variantId, capture.revision)
  const address = handle.server.resolvedUrls?.local[0]
  if (!address) throw new McpDomainError('PREVIEW_NOT_READY', 'Loopback preview server is unavailable', true)
  const config = handle.context.config
  return { root: handle.context.root, host: getDevPreviewHost(handle.server), target: { origin: new URL(address).origin, storyId: target.storyId, variantId: target.variantId, epoch: capture.epoch, width: target.width, height: target.height, deviceScaleFactor: target.deviceScaleFactor, globals: target.globals ?? config.preview?.globals ?? {}, colorScheme: target.colorScheme ?? (config.theme.defaultColorScheme === 'auto' ? undefined : config.theme.defaultColorScheme), textDirection: target.textDirection, backgroundColor: config.backgroundPresets?.[0]?.color ?? 'transparent', isActive: capture.isActive } }
}

/** Install one concrete executor shared by HTTP and stdio project workers. */
export function registerDevScreenshotExecutor(operations: ReturnType<typeof createDevMcpOperations>): void {
  operations.registerExecutor('screenshot', (input, capture) => {
    const target = mcpToolInputSchemas.histoire_capture_screenshot.parse(input)
    return createScreenshotTask(resolveDevPreviewOptions(target, capture))
  })
}
