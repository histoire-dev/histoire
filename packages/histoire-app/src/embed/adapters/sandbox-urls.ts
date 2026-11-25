import type { HistoireTarget } from '@histoire/protocol'
import { setFramePurpose } from '@histoire/shared'

/** Options of {@link createRuntimeFrameUrl}. */
export interface RuntimeFrameUrlOptions {
  /** Variant the primary document mounts first; navigation only happens with a variant selected. */
  target: HistoireTarget
  /** Parent-minted document identity. */
  documentId: string
  /** Selection generation acknowledged by the document. */
  selectionVersion: number
  /** Standalone workbench host, which forwards its own base presentation flags. */
  standalone?: boolean
  /** Embed gutter in CSS pixels; the canvas draws its own, so standalone hosts never pass it. */
  padding?: number
}

/** Base sandbox URL carrying the exact target identities; every caller holds a selected variant. */
function createSandboxUrl(base: string | URL, target: HistoireTarget) {
  const url = new URL('__sandbox.html', base)
  url.searchParams.set('storyId', target.storyId)
  url.searchParams.set('variantId', target.variantId!)
  return url
}

/**
 * Interactive primary runtime document (also used by canvas replicas and Matrix
 * cells). Purpose stays implicit: absence means `interactive`, and `matrix=true`
 * is only a presentation flag.
 */
export function createRuntimeFrameUrl(base: URL, options: RuntimeFrameUrlOptions): string {
  const url = createSandboxUrl(base, options.target)
  url.searchParams.set('documentId', options.documentId)
  url.searchParams.set('selectionVersion', String(options.selectionVersion))
  url.searchParams.set('embed', 'true')
  if (options.standalone) url.searchParams.set('standalone', 'true')
  else if (options.padding) url.searchParams.set('padding', String(options.padding))
  if (options.standalone && base.searchParams.get('nativeScroll') === 'true') url.searchParams.set('nativeScroll', 'true')
  if (options.standalone && base.searchParams.get('matrix') === 'true') url.searchParams.set('matrix', 'true')
  return url.href
}

/** Hidden in-book test-worker document running exactly one test case. */
export function createTestWorkerUrl(base: URL, target: HistoireTarget, documentId: string): string {
  const url = createSandboxUrl(base, target)
  url.searchParams.set('documentId', documentId)
  url.searchParams.set('embed', 'true')
  setFramePurpose(url, 'test-worker')
  return url.href
}

/** Custom controls replica document rendering only the story's controls slot. */
export function createControlsReplicaUrl(base: string | URL, target: HistoireTarget, documentId: string): string {
  const url = createSandboxUrl(base, target)
  setFramePurpose(url, 'controls')
  url.searchParams.set('documentId', documentId)
  return url.href
}
