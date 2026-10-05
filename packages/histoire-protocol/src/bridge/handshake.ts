import type { HistoireSourceDescriptor } from '../types/catalog.js'
import type { HistoireErrorData } from '../types/error.js'
import type { HistoireBridgeIdentity, HistoirePortRole, HistoireProtocolRange } from './types.js'
import { HistoireSdkError } from '../types/error.js'
import { validateHistoireSourceDescriptor } from './catalog.js'
import { validateHistoireErrorData } from './results.js'
import { validateWireValue } from './size.js'
import { invalid, validateEmbedOrigin, wireId, wireRecord } from './validation.js'

/** Exact frame bootstrap; hints authorize nothing until actual message origin/source match. */
export interface HistoireBridgeHello {
  /** Window-message discriminator. */
  kind: 'histoire:hello'
  /** Supported host protocol range. */
  protocolRange: HistoireProtocolRange
  /** Fresh challenge tied to one transferred port. */
  nonce: string
  /** Host controller identity. */
  sessionId: string
  /** Bridge or surface attachment identity. */
  mountId: string
  /** Exact actual parent origin. */
  parentOrigin: string
  /** Port authority derived from requested first-party document. */
  role: HistoirePortRole
}

/** Port-only acknowledgment; unsolicited global messages cannot create connections. */
export type HistoireBridgeAck = { kind: 'histoire:ack', nonce: string, protocolRange: HistoireProtocolRange } & (
  { ok: true, owner: HistoireBridgeIdentity, descriptor: HistoireSourceDescriptor }
  | { ok: false, error: HistoireErrorData }
)

/** Requires finite positive supported protocol interval. */
export function validateHistoireProtocolRange(value: unknown): HistoireProtocolRange {
  const input = wireRecord(value)
  if (Object.keys(input).some(key => !['min', 'max'].includes(key)) || !Number.isSafeInteger(input.min) || !Number.isSafeInteger(input.max) || (input.min as number) < 1 || (input.max as number) < (input.min as number)) invalid('Invalid protocol range')
  return input as unknown as HistoireProtocolRange
}

/** Chooses highest common version, with both ranges in typed failure. */
export function negotiateHistoireProtocol(host: HistoireProtocolRange, book: HistoireProtocolRange): number {
  validateHistoireProtocolRange(host)
  validateHistoireProtocolRange(book)
  const version = Math.min(host.max, book.max)
  if (version < Math.max(host.min, book.min)) throw new HistoireSdkError('PROTOCOL_MISMATCH', `Host protocol ${host.min}–${host.max}; book protocol ${book.min}–${book.max}`)
  return version
}

/** Validates bounded hello before accessing any untrusted bootstrap fields. */
export function validateHistoireHello(value: unknown): HistoireBridgeHello {
  validateWireValue(value, { kind: 'metadata', name: '' })
  const input = wireRecord(value)
  if (Object.keys(input).some(key => !['kind', 'protocolRange', 'nonce', 'sessionId', 'mountId', 'parentOrigin', 'role'].includes(key)) || input.kind !== 'histoire:hello' || !['data', 'primary', 'controls', 'view'].includes(input.role as string)) invalid('Invalid handshake hello')
  for (const key of ['nonce', 'sessionId', 'mountId']) {
    if (!wireId(input[key])) invalid('Invalid handshake identity')
  }
  validateHistoireProtocolRange(input.protocolRange)
  validateEmbedOrigin(input.parentOrigin)
  return input as unknown as HistoireBridgeHello
}

/** Validates descriptor separately from small handshake metadata. */
export function validateHistoireAck(value: unknown, hello: HistoireBridgeHello): HistoireBridgeAck {
  const input = wireRecord(value)
  if (Object.keys(input).some(key => !['kind', 'nonce', 'protocolRange', 'ok', 'owner', 'descriptor', 'error'].includes(key)) || input.kind !== 'histoire:ack' || input.nonce !== hello.nonce || typeof input.ok !== 'boolean') invalid('Invalid handshake acknowledgment')
  const range = validateHistoireProtocolRange(input.protocolRange)
  if (!input.ok) {
    validateHistoireErrorData(input.error)
  }
  else {
    const owner = wireRecord(input.owner)
    const version = negotiateHistoireProtocol(hello.protocolRange, range)
    if (owner.protocolVersion !== version || owner.sessionId !== hello.sessionId || owner.mountId !== hello.mountId) invalid('Mismatched handshake owner/version')
    for (const key of ['connectionId', 'sourceId', 'epoch', 'revision']) {
      if (!wireId(owner[key])) invalid('Invalid handshake owner')
    }
    if (owner.selectionVersion !== undefined && (!Number.isSafeInteger(owner.selectionVersion) || (owner.selectionVersion as number) < 0)) invalid('Invalid handshake selection generation')
    if (Object.keys(owner).some(key => !['protocolVersion', 'sessionId', 'mountId', 'connectionId', 'sourceId', 'epoch', 'revision', 'selectionVersion'].includes(key))) invalid('Unknown handshake owner field')
    const descriptor = validateHistoireSourceDescriptor(input.descriptor)
    for (const key of ['sourceId', 'epoch', 'revision'] as const) {
      if (owner[key] !== descriptor[key]) invalid('Mismatched handshake descriptor')
    }
    if (descriptor.protocolVersion !== version) invalid('Mismatched descriptor protocol')
  }
  validateWireValue({ kind: input.kind, nonce: input.nonce, protocolRange: input.protocolRange, ok: input.ok, ...(input.ok ? { owner: input.owner } : { error: input.error }) }, { kind: 'metadata', name: '' })
  return input as unknown as HistoireBridgeAck
}
