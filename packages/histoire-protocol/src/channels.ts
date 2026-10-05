import type { HistoireJsonValue, HistoireTarget } from './types/common.js'
import { measureWireValue } from './bridge/size.js'
import { invalid, validateHistoireTarget, wireId, wireRecord } from './bridge/validation.js'

/** Application data only; Histoire never interprets message type or body. */
export interface HistoireHostChannelPayload {
  /** Explicitly configured channel name. */
  name: string
  /** Application-owned message discriminator. */
  type: string
  /** Bounded JSON, without callbacks, classes or DOM objects. */
  data: HistoireJsonValue
}

/** Exact originating actor, including non-selected cells of current grid. */
export interface HistoireHostChannelMessage extends HistoireHostChannelPayload {
  /** Actual runtime document, never a WindowProxy identity. */
  runtimeId: string
  /** Structured origin captured by story handle at initialization. */
  target: HistoireTarget
}

/** Local story API; callbacks stay inside runtime and never become wire data. */
export interface HistoireStoryHostChannel {
  /** Admit bounded JSON to owning document; rejected promises are observed internally. */
  post: (type: string, data: HistoireJsonValue) => Promise<void>
  /** Listen for application type on captured variant; returns unsubscribe. */
  on: (type: string, listener: (data: HistoireJsonValue, message: HistoireHostChannelMessage) => void) => () => void
  /** Saturated local rate, inbound validation, and listener failure count. */
  getDroppedCount: () => number
}

/** Validate and copy opt-in names; duplicate names confer no extra authority. */
export function validateHostChannelNames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(name))) invalid('Invalid host channel names')
  return [...new Set(value)] as string[]
}

/** One canonical JSON traversal also limits UTF-8 wire bytes and rejects accessors. */
export function validateHostChannelPayload(value: unknown, attributed = false): HistoireHostChannelPayload {
  measureWireValue(value, { maxBytes: 64 * 1024 })
  const input = wireRecord(value)
  const fields = attributed ? ['name', 'type', 'data', 'runtimeId', 'target'] : ['name', 'type', 'data']
  if (Object.keys(input).some(key => !fields.includes(key)) || !wireId(input.type) || !Object.hasOwn(input, 'data')) invalid('Invalid host channel payload')
  validateHostChannelNames([input.name])
  if (attributed) {
    if (!wireId(input.runtimeId)) invalid('Invalid host channel runtime')
    validateHistoireTarget(input.target)
    if ((input.target as HistoireTarget).variantId === null) invalid('Host channel needs a variant')
  }
  return input as unknown as HistoireHostChannelPayload
}

/** Bounded sliding window shared by each owner/direction; no timers or replay queue. */
export function createHostChannelRateLimiter(now: () => number = Date.now) {
  const accepted: number[] = []
  let dropped = 0
  return {
    /** Count saturates, so hostile traffic cannot overflow portable integers. */
    get droppedCount() { return dropped },
    /** Record local schema/callback failures as well as rate overflow. */
    drop() { dropped = Math.min(Number.MAX_SAFE_INTEGER, dropped + 1) },
    /** Admit at most 50 messages in any elapsed second across all names. */
    accept() {
      const time = now()
      while (accepted.length && accepted[0] <= time - 1000) accepted.shift()
      if (accepted.length === 50) {
        this.drop()
        return false
      }
      accepted.push(time)
      return true
    },
    /** A replacement document never inherits pending messages or old rate tokens. */
    reset() {
      accepted.length = 0
      dropped = 0
    },
  }
}
