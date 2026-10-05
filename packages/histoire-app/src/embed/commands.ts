import type { HistoireBridgeRequest, HistoireSourceDescriptor } from '@histoire/protocol'
import type { HistoireRequestCapture } from '@histoire/sdk/internal'
import type { EmbedSurfaceInstance } from './surfaces.js'
import type { EmbedSourceConnection } from './types.js'
import { HistoireSdkError } from '@histoire/protocol'
/** Policy projection applies to every revision, including later HMR publications. */
export function projectEmbedDescriptor(value: HistoireSourceDescriptor, parentOrigin: string, bookOrigin: string): HistoireSourceDescriptor {
  const descriptor = structuredClone(value)
  if (parentOrigin !== bookOrigin) {
    if (!descriptor.embed?.allowOpenInEditor) {
      descriptor.capabilities.openInEditor = { available: false, reason: 'CAPABILITY_UNAVAILABLE' }
    }
    if (!descriptor.embed?.allowServerTests) {
      descriptor.capabilities.serverTests = { available: false, reason: 'CAPABILITY_UNAVAILABLE' }
    }
  }
  return descriptor
}
/** Cross-origin policy is enforced at execution as well as capability projection. */
export function assertEmbedCommandPolicy(source: EmbedSourceConnection, parentOrigin: string, bookOrigin: string, command: string, payload: unknown): void {
  if (parentOrigin === bookOrigin) {
    return
  }
  if (command === 'openInEditor' && !source.descriptor.embed?.allowOpenInEditor) {
    throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Cross-origin editor access disabled')
  }
  if (command === 'tests.run' && (payload as {
    mode?: string
  }).mode === 'server' && !source.descriptor.embed?.allowServerTests) {
    throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Cross-origin server tests disabled')
  }
}
/** Dispatch finite data/runtime methods using local source lifetime, never remote capture IDs. */
export function dispatchEmbedCommand(source: EmbedSourceConnection, parentOrigin: string, bookOrigin: string, request: HistoireBridgeRequest, signal: AbortSignal, surface?: EmbedSurfaceInstance): Promise<unknown> | unknown {
  assertEmbedCommandPolicy(source, parentOrigin, bookOrigin, request.command, request.payload)
  const descriptor = source.descriptor
  if (['sourceId', 'epoch', 'revision'].some(key => request[key as 'sourceId'] !== descriptor[key as 'sourceId'])) {
    throw new HistoireSdkError('STALE_REVISION', 'Source publication changed')
  }
  const input = request.payload as any
  if (request.command === 'catalog.list') {
    return descriptor.catalog.stories
  }
  if (request.command === 'catalog.getStory') {
    const matches = descriptor.catalog.stories.filter(story => story.id === input.storyId)
    if (matches.length !== 1) {
      throw new HistoireSdkError(matches.length ? 'STORY_AMBIGUOUS' : 'STORY_NOT_FOUND', 'Story lookup failed')
    }
    return matches[0]
  }
  if (['subscriptions.add', 'subscriptions.remove'].includes(request.command)) {
    return null
  }
  if (['catalog.search', 'docs.get', 'openInEditor'].includes(request.command) || (request.command === 'source.get' && input.mode === 'raw') || (request.command === 'tests.run' && input.mode === 'server')) {
    const capture: HistoireRequestCapture = { ...request, connectionId: source.id, signal }
    return source.request(request.command as 'catalog.search' | 'docs.get' | 'source.get' | 'tests.run' | 'openInEditor', request.payload, capture)
  }
  if (surface?.request) {
    return surface.request(request.command, request.payload, { ...request, signal })
  }
  throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Requested command adapter unavailable')
}
