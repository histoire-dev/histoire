import type { HistoireSettings } from '@histoire/protocol'
import type { PreviewSessionOptions } from '../runtime/browser/session.js'
import type { ProjectServices } from './internal.js'
import type { HistoireCaptureOptions, HistoireCaptureResult } from './types.js'
import { HistoireSdkError, validateSettingsPatch } from '@histoire/protocol'
import { CAPTURE_LIMITS } from '../runtime/browser/limits.js'
import { createScreenshotTask } from '../runtime/browser/screenshot.js'
import { lookupTarget, validId } from '../runtime/catalog/lookup.js'
import { getDevPreviewHost } from '../vite/mcp-preview-html.js'
import { awaitSdkExecution, toSdkExecutionError } from './execution.js'

/** Validates strict public inputs before reserving lane or acquiring browser. */
function captureInput(options: HistoireCaptureOptions) {
  if (!options || !validId(options.storyId) || !validId(options.variantId)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Exact storyId and variantId required')
  const width = options.width ?? 480
  const height = options.height ?? 320
  const deviceScaleFactor = options.deviceScaleFactor ?? 1
  if (!Number.isInteger(width) || width < CAPTURE_LIMITS.minWidth || width > CAPTURE_LIMITS.width
    || !Number.isInteger(height) || height < CAPTURE_LIMITS.minHeight || height > CAPTURE_LIMITS.height
    || !Number.isInteger(deviceScaleFactor) || deviceScaleFactor < 1 || deviceScaleFactor > CAPTURE_LIMITS.deviceScaleFactor) {
    throw new HistoireSdkError('INVALID_ARGUMENT', 'Invalid capture viewport or device scale')
  }
  validateSettingsPatch({ ...(options.globals === undefined ? {} : { globals: options.globals }), ...(options.textDirection === undefined ? {} : { textDirection: options.textDirection }), ...(options.colorScheme === undefined ? {} : { colorScheme: options.colorScheme }) })
  if (options.signal?.aborted) throw new HistoireSdkError('CANCELLED', 'Capture cancelled')
  return { width, height, deviceScaleFactor }
}

/** Chooses one source synchronously; selected preview never falls back to live dev. */
export async function captureProjectScreenshot(services: ProjectServices, options: HistoireCaptureOptions): Promise<HistoireCaptureResult> {
  try {
    const dimensions = captureInput(options)
    let session: PreviewSessionOptions
    let execution = services.execution
    let defaults: Pick<HistoireSettings, 'globals' | 'textDirection' | 'colorScheme' | 'backgroundColor'>
    let isActive: () => boolean
    const preview = services.preview
    if (preview) {
      const source = preview.current
      if (preview.handle.status !== 'ready' || !source?.isActive() || !source.snapshot.capture.available) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Chosen preview capture source unavailable')
      source.snapshot.getTarget(options.storyId, options.variantId)
      defaults = source.snapshot.defaults
      execution = source.execution
      isActive = source.isActive
      session = { root: services.root, host: source.registry, target: { origin: source.origin, epoch: source.epoch, storyId: options.storyId, variantId: options.variantId, ...dimensions, textDirection: defaults.textDirection, backgroundColor: defaults.backgroundColor, isActive } }
    }
    else {
      const dev = services.dev
      const source = dev?.controller.current
      const snapshot = dev?.catalog?.current
      if (dev?.handle.status !== 'ready' || !source?.isActive() || !snapshot || dev.catalog.updating) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'No ready capture source')
      lookupTarget(snapshot, options.storyId, options.variantId)
      const config = source.context.config
      defaults = { globals: config.preview?.globals ?? {}, textDirection: config.preview?.textDirection ?? 'ltr', colorScheme: config.theme.defaultColorScheme, backgroundColor: config.backgroundPresets?.[0]?.color ?? 'transparent' }
      execution = dev.execution
      // Retained metadata is readable while collection runs, never executable.
      isActive = () => source.isActive() && dev.catalog?.current === snapshot && !dev.catalog.updating
      session = { root: services.root, host: getDevPreviewHost(source.server), target: { origin: new URL(dev.handle.url).origin, epoch: source.epoch, storyId: options.storyId, variantId: options.variantId, ...dimensions, textDirection: defaults.textDirection, backgroundColor: defaults.backgroundColor, isActive } }
    }
    const colorScheme = options.colorScheme ?? defaults.colorScheme
    session.target = { ...session.target, textDirection: options.textDirection ?? defaults.textDirection, colorScheme: colorScheme === 'auto' ? undefined : colorScheme, globals: { ...(options.globals ?? defaults.globals) }, backgroundColor: defaults.backgroundColor }
    const task = createScreenshotTask(session)
    const result = await awaitSdkExecution(execution.enqueue({ ...task, validate() {
      if (!isActive()) throw new HistoireSdkError('RUNTIME_CHANGED', 'Capture source changed')
    } }), options.signal)
    if (!isActive()) throw new HistoireSdkError('RUNTIME_CHANGED', 'Capture source changed')
    return { png: new Uint8Array(result.artifact), mimeType: 'image/png', width: result.result.width, height: result.result.height, sha256: result.result.sha256 }
  }
  catch (error) { throw toSdkExecutionError(error) }
}
