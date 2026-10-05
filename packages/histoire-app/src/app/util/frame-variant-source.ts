import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { FrameActionTarget } from './frame-actions.js'
import { HistoireSdkError } from '@histoire/protocol'
import { getHistoireSessionDescriptor } from '@histoire/sdk/internal'
import { shallowReactive } from 'vue'
import { matrixVariantSnippet } from './matrix.js'

/** Observe SDK's exact recursively readonly snapshot contract. */
type FrameSnapshot = ReturnType<HistoireSession['getSnapshot']>

/** Ready source generation and runtime document for one exact frame target. */
function sourceIdentity(snapshot: FrameSnapshot, target: HistoireTarget): string | undefined {
  const source = snapshot.source
  if (snapshot.status !== 'ready' || snapshot.stale || !source || snapshot.runtime.status !== 'ready' || !snapshot.runtime.runtimeId
    || snapshot.selection?.storyId !== target.storyId || snapshot.selection.variantId !== target.variantId || target.variantId === null) {
    return
  }
  return JSON.stringify([source.url, source.sourceId, source.epoch, source.revision, snapshot.runtime.mountId, snapshot.runtime.runtimeId, target.storyId, target.variantId])
}

/** Frame resolver identity also detects replacement behind an unchanged registry key. */
export interface FrameSourceOwner {
  /** Exact canonical or independent passive runtime session. */
  session: HistoireSession
  /** Readonly publication captured before asynchronous source generation. */
  snapshot: FrameSnapshot
  /** Source, target, mount and physical document signature. */
  generation: string
  /** Retired frame/session replies cannot reach clipboard or failure feedback. */
  isCurrent: () => boolean
}

/** Capture existing ready owner; source copying never selects another canonical variant. */
export function captureFrameSourceOwner(resolve: () => HistoireSession | null, target: HistoireTarget): FrameSourceOwner | undefined {
  const session = resolve()
  if (!session) return
  const capturedTarget = { storyId: target.storyId, variantId: target.variantId }
  const snapshot = session.getSnapshot()
  const generation = sourceIdentity(snapshot, capturedTarget)
  if (!generation) return
  return { session, snapshot, generation, isCurrent: () => resolve() === session && sourceIdentity(session.getSnapshot(), capturedTarget) === generation }
}

/** Framework source generation uses existing runtime service and shared variant wrapper. */
export function createFrameVariantSource(options: {
  /** Canonical catalog supplies availability while a paused frame has no document. */
  session: HistoireSession
  /** Resolve exact current frame; null never falls back to a different canonical target. */
  resolve: (target: FrameActionTarget) => HistoireSession | null
  /** Current-owner failures are surfaced through existing provider. */
  error?: (error: unknown) => void
}) {
  const unavailable = shallowReactive(new Map<string, { session: HistoireSession, generation: string, state: FrameSnapshot['state'] }>())
  /** Engine metadata can prove unsupported generation without mounting or reading host state. */
  function available(target: FrameActionTarget): boolean {
    const session = options.resolve(target) ?? options.session
    const snapshot = session.getSnapshot()
    const story = snapshot.catalog.stories.find(story => story.id === target.storyId)
    const variant = story?.variants.find(variant => variant.id === target.variantId)
    if (!variant || variant.source?.dynamic === false) return false
    try {
      if (!getHistoireSessionDescriptor(session).capabilities.dynamicSource.available) return false
    }
    catch { return false }
    const owner = captureFrameSourceOwner(() => options.resolve(target), target)
    const failed = unavailable.get(target.frameKey)
    return !(owner && failed && failed.session === owner.session && failed.generation === owner.generation && failed.state === owner.snapshot.state)
  }
  return {
    available,
    /** Loading/paused frames retain clear readiness feedback without mutating selection. */
    disabled(target: FrameActionTarget): string | undefined {
      return captureFrameSourceOwner(() => options.resolve(target), target) ? undefined : 'Wait for preview to finish loading.'
    },
    /** Generate markup from exact ready runtime; no raw fallback or serialized-state template. */
    async generate(target: FrameActionTarget): Promise<{ text: string, isCurrent: () => boolean } | undefined> {
      const owner = captureFrameSourceOwner(() => options.resolve(target), target)
      if (!owner || !available(target)) return
      const story = owner.snapshot.catalog.stories.find(story => story.id === target.storyId)
      const variant = story?.variants.find(variant => variant.id === target.variantId)
      if (!variant) return
      try {
        const source = await owner.session.source.get({ storyId: target.storyId, variantId: target.variantId, mode: 'dynamic' })
        if (!owner.isCurrent()) return
        if (source.mode !== 'dynamic' || source.storyId !== target.storyId || source.variantId !== target.variantId
          || source.epoch !== owner.snapshot.source!.epoch || source.revision !== owner.snapshot.source!.revision) {
          throw new HistoireSdkError('RUNTIME_CHANGED', 'Variant source belongs to another target or generation.')
        }
        const tag = story?.supportPluginId?.includes('svelte') ? 'Hst.Variant' : 'Variant'
        return { text: matrixVariantSnippet(variant.title, source.body, tag), isCurrent: owner.isCurrent }
      }
      catch (error) {
        if (!owner.isCurrent()) return
        if (error && typeof error === 'object' && 'code' in error && error.code === 'SOURCE_UNAVAILABLE') {
          unavailable.set(target.frameKey, { session: owner.session, generation: owner.generation, state: owner.snapshot.state })
        }
        else {
          options.error?.(error)
        }
      }
    },
  }
}
