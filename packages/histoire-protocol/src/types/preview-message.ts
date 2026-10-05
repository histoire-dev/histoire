import type { HistoireHostChannelPayload } from '../channels.js'
import type { HistoireControlsAppearanceMessage, HistoireControlsOverlayMessage, HistoireControlsOverlayRefreshMessage, HistoireControlsOverlayResultMessage } from './controls.js'
import type {
  HistoireCollectTestsPayload,
  HistoireRunTestsPayload,
  HistoireSerializedTestDefinition,
  HistoireTestError,
  HistoireTestRunSummary,
} from './test.js'

/**
 * Message types of the host <-> preview iframe postMessage protocol.
 *
 * Declared here rather than app-side because both ends read them: the app
 * imports them directly, and the generated preview runtime imports the app's
 * re-export. The payload types below are the only compiler check the protocol
 * gets — the preview side is generated JavaScript.
 */
export const STATE_SYNC = '__histoire:state-sync'
export const SANDBOX_READY = '__histoire:sandbox-ready'
export const EVENT_SEND = '__histoire:event'
export const PREVIEW_SETTINGS_SYNC = '__histoire:preview-settings-sync'
export const SELECT_VARIANT = '__histoire:select-variant'
export const VARIANT_READY = '__histoire:variant-ready'
export const PREVIEW_SYNC = '__histoire:preview-sync'
export const CONTROLS_READY = '__histoire:controls-ready'
export const CONTROLS_RESIZE = '__histoire:controls-resize'
export const COLLECT_TESTS = '__histoire:collect-tests'
export const RUN_TESTS = '__histoire:run-tests'
export const TEST_DEFINITIONS = '__histoire:test-definitions'
export const TEST_RESULT = '__histoire:test-result'
export const RUNTIME_REQUEST = '__histoire:runtime-request'
export const RUNTIME_RESULT = '__histoire:runtime-result'
export const RUNTIME_FAILED = '__histoire:runtime-failed'
export const RUNTIME_LAYOUT = '__histoire:runtime-layout'
export const RUNTIME_FOCUS = '__histoire:runtime-focus'
/** Application channel messages retain existing sandbox identity/origin guards. */
export const HOST_CHANNEL_MESSAGE = '__histoire:host-channel'

/** Data only, usable in either direction alongside correlated runtime requests. */
export interface HistoireHostChannelPreviewMessage extends HistoireStoryScopedMessage {
  /** Finite protocol discriminator, separate from application-owned message type. */
  type: typeof HOST_CHANNEL_MESSAGE
  /** Named JSON payload; no Histoire command or callback dispatch. */
  channel: HistoireHostChannelPayload
}

/** Finite first-party service request, bound to exact document and target. */
export interface HistoireRuntimeRequestMessage extends HistoireStoryScopedMessage {
  /** Service dispatcher marker. */
  type: typeof RUNTIME_REQUEST
  /** Correlated request lifetime. */
  requestId: string
  /** Runtime-owned operation. */
  command: 'state.get' | 'state.patch' | 'state.reset' | 'source.get' | 'channel.post'
  /** Isolated inspection read uses the getter-safe runtime projection. */
  inspection?: true
  /** Isolated inspection authority must match the nonce host lease. */
  mcpNonce?: string
  /** Isolated inspection authority must match the captured project epoch. */
  mcpEpoch?: string
  /** Validated operation input. */
  payload: unknown
}

/** Marker every host <-> preview message carries; both ends drop messages without it. */
export interface HistoireMessageMarker {
  __histoire: true
  /** Outbound document lifetime; iframe WindowProxy persists across navigation. */
  documentId?: string
}

/**
 * Story a message belongs to.
 *
 * Carried by every message about a variant: the preview iframe keeps the same
 * window across `src` navigations, so a message from a document being torn down
 * still passes the source check and must be told apart by the story it names.
 */
interface HistoireStoryScopedMessage {
  storyId?: string | null
  variantId?: string | null
}

/** Tells the preview which story/variant it should be showing. */
export interface HistoirePreviewSyncMessage {
  type: typeof PREVIEW_SYNC
  storyId: string
  variantId: string | null
  /** True when the preview renders the whole variant grid. */
  grid: boolean
}

/** One variant's state, sent in both directions. */
export interface HistoireStateSyncMessage extends HistoireStoryScopedMessage {
  type: typeof STATE_SYNC
  variantId: string
  state: any
  /** Controls-only document edit watermark; legacy hosts and primary frames omit it. */
  controlsRevision?: number
}

/** Preview settings (background, text direction…) pushed by the host. */
export interface HistoirePreviewSettingsSyncMessage {
  type: typeof PREVIEW_SETTINGS_SYNC
  settings: Record<string, any>
}

/** Variant selection, sent by the host (grid mode) or by the preview. */
export interface HistoireSelectVariantMessage {
  type: typeof SELECT_VARIANT
  variantId: string
  /** Embed host intent version for rejecting delayed grid clicks; legacy hosts may omit it. */
  selectionVersion?: number
}

/** The preview document booted (and applied its initial selection). */
export interface HistoireSandboxReadyMessage extends HistoireStoryScopedMessage {
  type: typeof SANDBOX_READY
}

/** One variant finished rendering in the preview. */
export interface HistoireVariantReadyMessage extends HistoireStoryScopedMessage {
  type: typeof VARIANT_READY
}

/** The controls-only preview finished rendering the story's `#controls` slot. */
export interface HistoireControlsReadyMessage extends HistoireStoryScopedMessage {
  type: typeof CONTROLS_READY
  /** Whether the story/variant actually provides a custom controls slot. */
  hasControls: boolean
}

/** New height of the controls-only preview document. */
export interface HistoireControlsResizeMessage {
  type: typeof CONTROLS_RESIZE
  height: number
}

/** A story event forwarded to the Events panel. */
export interface HistoireEventSendMessage {
  type: typeof EVENT_SEND
  event: unknown
}

/** Owned preview focus/search intent; finite presentation action, never arbitrary keyboard dispatch. */
export interface HistoireRuntimeFocusMessage extends HistoireStoryScopedMessage {
  /** Focus publication discriminator. */
  type: typeof RUNTIME_FOCUS
  /** Whether owned story document currently has focus. */
  focused: boolean
  /** Explicit search shortcut; other keys stay inside story. */
  action?: 'search'
}

/** Host request: collect the tests a variant registers. */
export type HistoireCollectTestsMessage = HistoireCollectTestsPayload & {
  type: typeof COLLECT_TESTS
}

/** Host request: run the tests of a variant. */
export type HistoireRunTestsMessage = HistoireRunTestsPayload & {
  type: typeof RUN_TESTS
}

/** Preview reply to {@link HistoireCollectTestsMessage}. */
export type HistoireTestDefinitionsMessage = HistoireCollectTestsPayload & {
  type: typeof TEST_DEFINITIONS
  definitions: HistoireSerializedTestDefinition[]
  /** Set when the preview-side collection crashed instead of returning definitions. */
  error?: HistoireTestError | null
}

/** Preview reply to {@link HistoireRunTestsMessage}. */
export type HistoireTestResultMessage = HistoireRunTestsPayload & {
  type: typeof TEST_RESULT
  summary: HistoireTestRunSummary
}

/** Every message the host posts into the preview iframe. */
export type HistoireHostMessage =
  | HistoireHostChannelPreviewMessage
  | HistoireControlsAppearanceMessage
  | HistoireControlsOverlayRefreshMessage
  | HistoireControlsOverlayResultMessage
  | HistoirePreviewSyncMessage
  | HistoireStateSyncMessage
  | HistoirePreviewSettingsSyncMessage
  | HistoireSelectVariantMessage
  | HistoireCollectTestsMessage
  | HistoireRunTestsMessage
  | HistoireRuntimeRequestMessage

/** Every message the preview iframe posts back to the host. */
export type HistoirePreviewMessage =
  | HistoireHostChannelPreviewMessage
  | HistoireControlsOverlayMessage
  | HistoireStateSyncMessage
  | HistoireSandboxReadyMessage
  | HistoireVariantReadyMessage
  | HistoireControlsReadyMessage
  | HistoireControlsResizeMessage
  | HistoireSelectVariantMessage
  | HistoireEventSendMessage
  | HistoireRuntimeFocusMessage
  | HistoireTestDefinitionsMessage
  | HistoireTestResultMessage

/**
 * An inbound preview message as it is actually received: the payload crossed a
 * postMessage boundary, so nothing guarantees it is well-formed.
 */
export type HistoireInboundPreviewMessage = Partial<HistoirePreviewMessage> & {
  type?: string
  [key: string]: any
}
