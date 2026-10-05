import type { HistoireHostMessage as PortableHostMessage, HistoirePreviewMessage as PortablePreviewMessage } from '@histoire/protocol'

// Keep legacy preview names while sharing one portable protocol.
export { RUNTIME_FAILED, RUNTIME_FOCUS, RUNTIME_LAYOUT, RUNTIME_REQUEST, RUNTIME_RESULT } from '@histoire/protocol'
export type { HistoireRuntimeFocusMessage, HistoireRuntimeRequestMessage } from '@histoire/protocol'
export { HOST_CHANNEL_MESSAGE } from '@histoire/protocol'
export type { HistoireHostChannelPreviewMessage } from '@histoire/protocol'
export { COLLECT_TESTS, CONTROLS_READY, CONTROLS_RESIZE, EVENT_SEND, PREVIEW_SETTINGS_SYNC, PREVIEW_SYNC, RUN_TESTS, SANDBOX_READY, SELECT_VARIANT, STATE_SYNC, TEST_DEFINITIONS, TEST_RESULT, VARIANT_READY } from '@histoire/protocol'
export type { HistoireCollectTestsMessage, HistoireControlsReadyMessage, HistoireControlsResizeMessage, HistoireEventSendMessage, HistoireMessageMarker, HistoirePreviewSettingsSyncMessage, HistoirePreviewSyncMessage, HistoireRunTestsMessage, HistoireSandboxReadyMessage, HistoireSelectVariantMessage, HistoireStateSyncMessage, HistoireTestDefinitionsMessage, HistoireTestResultMessage, HistoireVariantReadyMessage } from '@histoire/protocol'

/** Request element metrics using frame-local CSS pixels. */
export const MEASURE_REQUEST = '__histoire:measure-request'
/** Element metrics reply; older runtimes safely ignore the request. */
export const MEASURE_RESULT = '__histoire:measure-result'
/** Request an element anchor for a contextual comment. */
export const ELEMENT_PICK_REQUEST = '__histoire:element-pick-request'
/** Stable element anchor reply. */
export const ELEMENT_PICK_RESULT = '__histoire:element-pick-result'
/** Complete prop override set for one isolated matrix frame. */
export const PROPS_OVERRIDE = '__histoire:props-override'

/** Serializable bounds in frame-local CSS pixels, unaffected by host canvas zoom. */
export interface HistoireElementRect {
  /** Left coordinate. */
  x: number
  /** Top coordinate. */
  y: number
  /** Element width. */
  width: number
  /** Element height. */
  height: number
  /** Top edge. */
  top: number
  /** Right edge. */
  right: number
  /** Bottom edge. */
  bottom: number
  /** Left edge. */
  left: number
}

/** Computed element box spacing in CSS pixels. */
export interface HistoireElementSpacing {
  /** Top spacing. */
  top: number
  /** Right spacing. */
  right: number
  /** Bottom spacing. */
  bottom: number
  /** Left spacing. */
  left: number
}

/** Optional tuple and request identity protect hosts against delayed frame replies. */
interface HistoireInspectionIdentity {
  /** Host-owned request correlation. */
  requestId?: string
  /** Current story when known by host. */
  storyId?: string | null
  /** Current variant when known by host. */
  variantId?: string | null
}

/** Element under a point in the preview document. */
export interface HistoireElementPickResult {
  /** Unique selector, preferring test attributes and IDs. */
  selector: string
  /** Element bounds. */
  rect: HistoireElementRect
  /** Bounded text context, excluded for password inputs. */
  text?: string
}

/** Box model measurements for the selected element. */
export interface HistoireMeasureResult extends HistoireElementPickResult {
  /** Parent bounds, or viewport bounds when no parent exists. */
  parentRect: HistoireElementRect
  /** Computed element padding. */
  padding: HistoireElementSpacing
  /** Computed element margin. */
  margin: HistoireElementSpacing
}

/** Host request to inspect a frame point. */
export interface HistoireElementInspectionRequest extends HistoireInspectionIdentity {
  /** Inspection operation. */
  type: typeof MEASURE_REQUEST | typeof ELEMENT_PICK_REQUEST
  /** Horizontal coordinate. */
  x: number
  /** Vertical coordinate. */
  y: number
}

/** Frame response, including null when no element exists at the point. */
export interface HistoireElementInspectionReply extends HistoireInspectionIdentity {
  /** Reply operation. */
  type: typeof MEASURE_RESULT | typeof ELEMENT_PICK_RESULT
  /** Element context for the requested point. */
  result: HistoireMeasureResult | HistoireElementPickResult | null
}

/** Complete overrides merge through the existing control state path. */
export interface HistoirePropsOverrideMessage extends HistoireInspectionIdentity {
  /** Matrix override operation. */
  type: typeof PROPS_OVERRIDE
  /** Variant rendered by this isolated frame. */
  variantId: string
  /** Bounded JSON prop values; runtime control metadata cannot be overwritten. */
  props: Record<string, unknown>
}

/** Existing portable host protocol with additive workbench frame operations. */
export type HistoireHostMessage = PortableHostMessage | HistoireElementInspectionRequest | HistoirePropsOverrideMessage
/** Existing portable preview protocol with additive element inspection replies. */
export type HistoirePreviewMessage = PortablePreviewMessage | HistoireElementInspectionReply
/** Untrusted inbound traffic retains structural validation at runtime. */
export type HistoireInboundPreviewMessage = Partial<HistoirePreviewMessage> & { type?: string, [key: string]: any }
