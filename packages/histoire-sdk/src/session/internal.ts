import type { HistoirePresetAction, HistoirePresetList, HistoireSelectionInput, HistoireSessionStatus, HistoireSourceDescriptor, HistoireStoryFileOrigin, HistoireTarget } from '@histoire/protocol'
import type { HistoireMount, HistoireSession } from '../types.js'
import type { SessionContext } from './context.js'
import { HistoireSdkError, isHistoireProjectFileOrigin, validateBridgePayload, validateHistoireSourceDescriptor } from '@histoire/protocol'
import { observeOperation } from './ownership.js'
import { request } from './request.js'
import { copyProjection, freezeProjection } from './snapshot.js'
import { primaryRuntime } from './state.js'
import { assertVariant } from './variant.js'

/** Finite docs-link intent; only standalone supplies routing, while native hosts keep URLs local. */
export interface HistoireStoryLink {
  /** Exact collected target, retaining explicit null versus omitted variant choice. */
  readonly selection: HistoireSelectionInput
  /** Requested panel from source link, interpreted only by standalone routing. */
  readonly panel?: string
  /** Source documentation anchor, scoped to native panel or standalone route. */
  readonly anchor?: string
}

/** One first-party registry for source metadata and finite runtime/UI actions. */
interface SessionInternals {
  descriptor: () => HistoireSourceDescriptor
  /** Exact immutable descriptor accepted by the owning controller. */
  acceptedDescriptor?: () => HistoireSourceDescriptor
  presets: (input: HistoirePresetAction) => Promise<HistoirePresetList>
  openInEditor?: (target: HistoireTarget) => Promise<null>
  docsPolicy?: 'trusted-local'
  selectionSettled?: () => Promise<void>
  /** Exact active primary handle; a retained closing mountId proves no ownership. */
  primaryMountActive?: (mount: HistoireMount) => boolean
  /** Owned standalone adapter preserves link presentation alongside canonical selection. */
  storyLink?: (link: HistoireStoryLink) => Promise<void>
}
const sessions = new WeakMap<HistoireSession, SessionInternals>()
const internalsKey = Symbol.for('@histoire/sdk/session-internals/protocol-1')
const acceptedDescriptors = new WeakSet<object>()

/** Read-only snapshot fields required to decide editor-action visibility. */
interface EditorActionSnapshot {
  /** Current connection state. */
  readonly status: HistoireSessionStatus
  /** Whether current catalog no longer matches source revision. */
  readonly stale: boolean
  /** Connected source mode, when available. */
  readonly source: { readonly mode: 'dev' | 'static' } | null
  /** Current editor capability state. */
  readonly capabilities: { readonly openInEditor: { readonly available: boolean } }
  /** Current catalog stories needed for provenance lookup. */
  readonly catalog: { readonly stories: readonly { readonly id: string, readonly fileOrigin?: HistoireStoryFileOrigin }[] }
  /** Current story target, when selected. */
  readonly selection: Readonly<HistoireTarget> | null
}

/** Separate SDK/native bundles resolve delegates on same owned controller, never global active state. */
function internals(session: HistoireSession): SessionInternals | undefined {
  return sessions.get(session) ?? (session as HistoireSession & { [internalsKey]?: SessionInternals })[internalsKey]
}

/** Source-document proxy registers only finite delegates, never another controller. */
export function registerHistoireSessionInternals(session: HistoireSession, delegates: SessionInternals): void {
  sessions.set(session, delegates)
  if (!Object.hasOwn(session, internalsKey)) Object.defineProperty(session, internalsKey, { get: () => sessions.get(session), enumerable: false })
}

/** Fully validate, detach, and freeze one source descriptor before branding it accepted. */
export function acceptHistoireSourceDescriptor(value: unknown): HistoireSourceDescriptor {
  const descriptor = copyProjection(validateHistoireSourceDescriptor(value))
  freezeProjection(descriptor)
  acceptedDescriptors.add(descriptor)
  return descriptor
}

/** Checks identity against SDK-minted immutable projections; shape alone never grants trust. */
export function isAcceptedHistoireSourceDescriptor(value: unknown): value is HistoireSourceDescriptor {
  return typeof value === 'object' && value !== null && acceptedDescriptors.has(value)
}

/** Select one known docs link through explicit standalone adapter or router-free native controller. */
export function selectHistoireStoryLink(session: HistoireSession, link: HistoireStoryLink): Promise<void> {
  try {
    return observeOperation(internals(session)?.storyLink?.(link) ?? session.selection.select(link.selection))
  }
  catch (error) {
    return observeOperation(Promise.reject(error))
  }
}

/** Trust is granted by first-party local adapter, never URL/origin/source descriptor. */
export function getHistoireDocsPolicy(session: HistoireSession): 'trusted-local' | 'remote' {
  return internals(session)?.docsPolicy ?? 'remote'
}

/** Compatibility type entry; protocol owns finite preset wire definitions. */
export type { HistoirePresetAction, HistoirePresetList } from '@histoire/protocol'

/** Bind private context without exposing adapters/controller through internal getters. */
export function bindHistoireSessionInternals(session: HistoireSession, context: SessionContext, selectionSettled: () => Promise<void>): void {
  registerHistoireSessionInternals(session, {
    selectionSettled,
    primaryMountActive(mount) {
      const owned = context.mounts.get(mount.id)
      return context.primaryId === mount.id && owned?.handle === mount && owned.active
    },
    descriptor() {
      context.assertConnected()
      return structuredClone(context.descriptor!)
    },
    acceptedDescriptor() {
      context.assertConnected()
      return context.descriptor!
    },
    async openInEditor(target) {
      validateBridgePayload('openInEditor', target)
      context.assertCapability('openInEditor')
      const story = context.story(target.storyId)
      if (!isHistoireProjectFileOrigin(story.fileOrigin)) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Editor is unavailable for non-project stories')
      if (target.variantId != null) assertVariant(story, target.variantId)
      return request<null>(context, context.assertConnected(), 'openInEditor', target)
    },
    async presets(input) {
      validateBridgePayload('controls.preset', input)
      const primary = primaryRuntime(context)
      const result = await request<HistoirePresetList>(context, primary.transport, 'controls.preset', input, { kind: 'runtime', mountId: primary.handle.id })
      if (input.action === 'apply' || input.action === 'delete') await session.state.get()
      return result
    },
  })
}

/** First-party layout transitions await current selection ACK without replay or public state fields. */
export function waitForHistoireSelection(session: HistoireSession): Promise<void> {
  return internals(session)?.selectionSettled?.() ?? Promise.resolve()
}

/** First-party primary wrappers cannot admit a closing handle from snapshot identity alone. */
export function isHistoirePrimaryMountActive(session: HistoireSession, mount: HistoireMount): boolean {
  return internals(session)?.primaryMountActive?.(mount) ?? false
}

/** Detached current source descriptor; no mutable source config or adapter access. */
export function getHistoireSessionDescriptor(session: HistoireSession) {
  const entry = internals(session)
  if (!entry) throw new HistoireSdkError('NOT_CONNECTED', 'First-party session metadata unavailable')
  return entry.descriptor()
}

/** Returns branded metadata when module copies agree, else uses the detached legacy delegate. */
export function getAcceptedHistoireSessionDescriptor(session: HistoireSession): HistoireSourceDescriptor {
  const entry = internals(session)
  if (!entry) throw new HistoireSdkError('NOT_CONNECTED', 'Accepted first-party session metadata unavailable')
  const descriptor = entry.acceptedDescriptor?.()
  return isAcceptedHistoireSourceDescriptor(descriptor) ? descriptor : entry.descriptor()
}

/** Current target can expose an editor action only for a ready project-owned dev story. */
export function canOpenHistoireTargetInEditor(snapshot: EditorActionSnapshot, target: Readonly<HistoireTarget> | null = snapshot.selection): boolean {
  if (!target || snapshot.status !== 'ready' || snapshot.stale || snapshot.source?.mode !== 'dev' || !snapshot.capabilities.openInEditor.available) return false
  const story = snapshot.catalog.stories.find(story => story.id === target.storyId)
  return !!story && isHistoireProjectFileOrigin(story.fileOrigin)
}

/** Capture current primary through existing operation guards; no implicit runtime creation. */
export function requestHistoireStatePreset(session: HistoireSession, input: HistoirePresetAction): Promise<HistoirePresetList> {
  const entry = internals(session)
  if (!entry) return observeOperation(Promise.reject(new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Runtime preset adapter unavailable')))
  try {
    return observeOperation(entry.presets(input))
  }
  catch (error) {
    return observeOperation(Promise.reject(error))
  }
}

/** First-party target-only editor action; arbitrary caller paths never enter transport. */
export function requestHistoireOpenInEditor(session: HistoireSession, target: HistoireTarget): Promise<null> {
  const entry = internals(session)
  if (!entry?.openInEditor) return observeOperation(Promise.reject(new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Editor adapter unavailable')))
  try {
    return observeOperation(entry.openInEditor(target))
  }
  catch (error) {
    return observeOperation(Promise.reject(error))
  }
}
