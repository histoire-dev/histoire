import type { HistoireBridgeCommand, HistoireBridgeEnvelope, HistoireBridgeEvent, HistoireBridgeIdentity, HistoirePortRole } from './types.js'
import { validateBridgeEventPayload } from './events.js'
import { validateBridgePayload } from './payload.js'
import { validateBridgeResult, validateHistoireErrorData } from './results.js'
import { validateWireValue } from './size.js'
import { HISTOIRE_BRIDGE_COMMANDS, HISTOIRE_BRIDGE_EVENTS } from './types.js'
import { invalid, validateHistoireTarget, wireId, wireRecord } from './validation.js'

/** Bridge message direction relative to parent document. */
type BridgeDirection = 'parent-to-child' | 'child-to-parent'

/** Runtime-only request groups; data bridge must never execute stories implicitly. */
const runtimeCommands = ['state.get', 'state.patch', 'state.reset', 'tests.collect', 'controls.preset', 'channel.post']

/** Gates role authority before dispatch, independently of advertised capability checks. */
function validateRole(role: HistoirePortRole, command: HistoireBridgeCommand, payload: Record<string, unknown>, direction: BridgeDirection): void {
  if (command === 'controls.configure') {
    if (role !== 'controls' || direction !== 'parent-to-child') invalid('Controls presentation requires parent controls port')
    return
  }
  if (command === 'controls.preset') {
    if (direction === 'parent-to-child' ? role !== 'primary' : !['primary', 'controls'].includes(role)) invalid('Preset action requires primary runtime or controls intent')
    return
  }
  if (command === 'view.sync') {
    if (direction !== 'parent-to-child') invalid('View sync is parent-to-view only')
    if (role === 'data') invalid('View sync requires surface port')
    return
  }
  if (direction === 'child-to-parent' && role !== 'data') {
    if (role === 'controls' && !['state.patch', 'state.reset', 'subscriptions.add', 'subscriptions.remove'].includes(command)) invalid('Controls port command unavailable')
    return
  }
  if (role === 'data' && (runtimeCommands.includes(command) || (command === 'source.get' && payload.mode === 'dynamic') || (command === 'tests.run' && payload.mode === 'preview'))) invalid('Data port cannot execute runtime commands')
  if (role === 'view') invalid('View port cannot execute runtime commands')
  if (role === 'controls' && !['state.patch', 'subscriptions.add', 'subscriptions.remove', 'view.sync'].includes(command)) invalid('Controls port command unavailable')
}

/**
 * Validates envelope before use; expected response command comes from pending request.
 * Metadata and body are each traversed once; `metadataOnly` stops after owner/identity checks
 * so callers can gate (rate, correlation) before running {@link validateBridgeEnvelopeBody}.
 */
export function validateBridgeEnvelope(value: unknown, owner: HistoireBridgeIdentity, role: HistoirePortRole, responseCommand?: HistoireBridgeCommand, direction: BridgeDirection = 'parent-to-child', metadataOnly = false): HistoireBridgeEnvelope {
  const input = validateBridgeEnvelopeMetadata(value, owner, direction)
  return metadataOnly ? input as unknown as HistoireBridgeEnvelope : validateBridgeEnvelopeBody(input, role, responseCommand, direction)
}

/**
 * Validates owner identity, kind discriminators and bounded metadata size.
 * @returns Envelope record; payload/result remain unchecked.
 */
function validateBridgeEnvelopeMetadata(value: unknown, owner: HistoireBridgeIdentity, direction: BridgeDirection): Record<string, unknown> {
  const input = wireRecord(value)
  const keys = ['protocolVersion', 'sessionId', 'connectionId', 'mountId', 'sourceId', 'epoch', 'revision'] as const
  const allowed = [...keys, 'runtimeId', 'target', 'selectionVersion', 'kind', ...(input.kind === 'request' ? ['requestId', 'command', 'payload', 'selectionRequestId'] : input.kind === 'response' ? ['requestId', 'ok', 'result', 'error'] : ['event', 'sequence', 'payload'])]
  if (Object.keys(input).some(key => !allowed.includes(key))) invalid('Unknown bridge envelope field')
  // Completed catalog/content publication advances revision on this same bound
  // source/epoch/connection. Transport also enforces monotonic event sequence.
  const publication = input.kind === 'event' && ['catalog.changed', 'content.changed'].includes(input.event as string)
  const metadata: Record<string, unknown> = {}
  for (const key of keys) {
    metadata[key] = input[key]
    if (key === 'protocolVersion' ? !Number.isSafeInteger(input[key]) || (input[key] as number) < 1 || input[key] !== owner[key] : !wireId(input[key]) || (!(key === 'revision' && publication) && input[key] !== owner[key])) invalid('Mismatched bridge owner/version')
  }
  if (input.runtimeId !== undefined) {
    if (!wireId(input.runtimeId) || (owner.runtimeId !== undefined && input.runtimeId !== owner.runtimeId)) invalid('Mismatched runtime owner')
    metadata.runtimeId = input.runtimeId
  }
  else if (owner.runtimeId !== undefined) {
    invalid('Missing runtime owner')
  }
  if (input.target !== undefined) {
    validateHistoireTarget(input.target)
    metadata.target = input.target
    const target = input.target as Record<string, unknown>
    if (owner.target && (target.storyId !== owner.target.storyId || target.variantId !== owner.target.variantId)) invalid('Mismatched runtime target')
  }
  else if (owner.target !== undefined) {
    invalid('Missing runtime target')
  }
  if (input.selectionVersion !== undefined) {
    if (!Number.isSafeInteger(input.selectionVersion) || (input.selectionVersion as number) < 0) invalid('Invalid selection generation')
    metadata.selectionVersion = input.selectionVersion
    if (input.kind !== 'event' && owner.selectionVersion !== undefined && input.selectionVersion !== owner.selectionVersion) invalid('Mismatched selection generation')
  }
  // Legacy unversioned owners remain valid. New surface ports require a capture
  // on child navigation so an earlier visit to the same target cannot regain authority.
  else if (input.kind === 'request' && input.command === 'selection.select' && direction === 'child-to-parent' && owner.selectionVersion !== undefined) {
    invalid('Missing selection generation')
  }
  metadata.kind = input.kind
  if (input.kind === 'request') {
    if (!wireId(input.requestId) || !HISTOIRE_BRIDGE_COMMANDS.includes(input.command as HistoireBridgeCommand)) invalid('Invalid bridge request')
    metadata.requestId = input.requestId
    metadata.command = input.command
    if (input.selectionRequestId !== undefined) {
      if (!wireId(input.selectionRequestId) || input.command !== 'view.sync' || direction !== 'parent-to-child') invalid('Selection acknowledgment requires parent view sync')
      metadata.selectionRequestId = input.selectionRequestId
    }
  }
  else if (input.kind === 'response') {
    if (!wireId(input.requestId) || typeof input.ok !== 'boolean') invalid('Invalid bridge response')
    metadata.requestId = input.requestId
    metadata.ok = input.ok
  }
  else if (input.kind === 'event') {
    if (!HISTOIRE_BRIDGE_EVENTS.includes(input.event as HistoireBridgeEvent) || !Number.isSafeInteger(input.sequence) || (input.sequence as number) < 0) invalid('Invalid bridge event')
    metadata.event = input.event
    metadata.sequence = input.sequence
  }
  else {
    invalid('Unknown bridge envelope kind')
  }
  // Single bounded traversal of the copied identity fields; payload is excluded.
  validateWireValue(metadata, { kind: 'metadata', name: '' })
  return input
}

/**
 * Validates payload/result/error and role authority of an envelope whose metadata
 * already passed `validateBridgeEnvelope(..., metadataOnly = true)` for the same object.
 * Each payload is measured once here; nested validators receive `measured` so they skip
 * re-measuring the same subtree under an identical or looser budget.
 */
export function validateBridgeEnvelopeBody(value: unknown, role: HistoirePortRole, responseCommand?: HistoireBridgeCommand, direction: BridgeDirection = 'parent-to-child'): HistoireBridgeEnvelope {
  const input = wireRecord(value)
  if (input.kind === 'request') {
    const command = input.command as HistoireBridgeCommand
    validateWireValue(input.payload, { kind: 'request', name: command })
    validateBridgePayload(command, input.payload, true)
    validateRole(role, command, wireRecord(input.payload), direction)
  }
  else if (input.kind === 'response') {
    if (input.ok) {
      if (!responseCommand) invalid('Successful response requires captured command')
      validateBridgeResult(responseCommand, input.result)
    }
    else {
      validateHistoireErrorData(input.error)
    }
  }
  else {
    validateBridgeEventBody(input, role, direction)
  }
  return input as unknown as HistoireBridgeEnvelope
}

/** Event payload schema plus role/direction authority for one publication. */
function validateBridgeEventBody(input: Record<string, unknown>, role: HistoirePortRole, direction: BridgeDirection): void {
  const event = input.event as HistoireBridgeEvent
  validateWireValue(input.payload, { kind: 'event', name: event })
  validateBridgeEventPayload(event, input.payload, true)
  if (event === 'channel.message') {
    const payload = wireRecord(input.payload)
    const target = wireRecord(payload.target)
    if (role !== 'primary' || direction !== 'child-to-parent' || !wireId(input.runtimeId) || payload.runtimeId !== input.runtimeId
      || !input.target || target.storyId !== wireRecord(input.target).storyId) {
      invalid('Host channel event requires exact primary document and story')
    }
  }
  if (event === 'focus.changed' && role === 'primary') {
    if (direction !== 'child-to-parent' || wireRecord(input.payload).direction !== undefined) invalid('Primary focus must come from owned document')
  }
  else if (event.startsWith('overlay.') || event === 'controls.height' || event === 'focus.changed') {
    if (role !== 'controls') invalid('Controls event requires controls port')
    if ((event === 'overlay.result') !== (direction === 'parent-to-child')) invalid('Controls event direction unavailable')
  }
  if (event === 'catalog.changed') {
    const descriptor = wireRecord(wireRecord(input.payload).descriptor)
    for (const key of ['sourceId', 'epoch', 'revision']) {
      if (descriptor[key] !== input[key]) invalid('Catalog publication identity mismatch')
    }
  }
}
