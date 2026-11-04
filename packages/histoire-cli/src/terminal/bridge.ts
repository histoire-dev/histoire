import type { RuntimeEvent, RuntimeReply, RuntimeSendResult } from '@histoire/dev-proxy/protocol'
import type { TerminalEventMap, TerminalOperationMap } from './protocol/core.js'
import type { TerminalEvents, TerminalOperations } from './protocol/index.js'
import { randomUUID } from 'node:crypto'
import { isBoundedCommand } from '@histoire/dev-proxy/protocol'
import { TERMINAL_BOUNDS, TerminalError } from './protocol/core.js'

/** Hands one command to the current ready runtime generation (the proxy handle). */
export interface TerminalTransport {
  /** Must reject nothing; unavailable runtimes answer with `{ ok: false }`. */
  send: (command: { id: string, operation: string, args?: unknown }) => Promise<RuntimeSendResult>
}

/** Per-call options of {@link TerminalBridge.send}. */
export interface TerminalSendOptions {
  /** Read deadline in milliseconds; defaults to 10 seconds. */
  timeout?: number
}

/** One child event, tagged with the generation that produced it. */
export interface TerminalBridgeEvent<Events extends TerminalEventMap = TerminalEvents> {
  /** Producing generation. */
  generation: string
  /** Event name. */
  event: keyof Events & string
  /** Detached payload; domain code validates it. */
  data: Events[keyof Events & string]
}

/** Parent side of the private command channel. */
export interface TerminalBridge<Operations extends TerminalOperationMap = TerminalOperations, Events extends TerminalEventMap = TerminalEvents> {
  /**
   * Sends one operation and settles exactly once: on reply, timeout, generation
   * retirement, transport failure or bridge close. Timeout never cancels work
   * the child already admitted and is never retried.
   */
  send: <K extends keyof Operations & string>(operation: K, args: Operations[K]['args'], options?: TerminalSendOptions) => Promise<Operations[K]['result']>
  /** Subscribes to current-generation events; listener faults are isolated. Returns an unsubscribe function. */
  subscribe: (listener: (event: TerminalBridgeEvent<Events>) => void) => () => void
  /** Feeds a proxy `onRuntimeMessage` frame into the bridge. */
  receive: (message: RuntimeReply | RuntimeEvent) => void
  /** Rejects every read of a generation and ignores its later frames (proxy `onRuntimeRetired`). */
  retire: (generation: string) => void
  /** Rejects all pending reads and drops listeners; later sends fail with `closed`. */
  close: () => void
  /** Number of reads currently awaiting an answer. */
  readonly pending: number
}

/** Remembered retired generations; far above any realistic restart burst in one session. */
const RETIRED_MEMORY = 64

/** In-flight read bookkeeping. */
interface PendingRead {
  /** Generation the transport delivered to, unknown until the send resolves. */
  generation?: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Creates the bridge over a transport. Owns the pending-read registry and its
 * timers; imports nothing from the runtime graph so it can load before binding.
 * @param options Transport, default timeout, and an identifier source (tests only).
 * @param options.transport Delivers commands to the ready runtime.
 * @param options.timeoutMs Default read deadline.
 * @param options.createId Overrides identifier generation.
 */
export function createTerminalBridge<Operations extends TerminalOperationMap = TerminalOperations, Events extends TerminalEventMap = TerminalEvents>(options: { transport: TerminalTransport, timeoutMs?: number, createId?: () => string }): TerminalBridge<Operations, Events> {
  const pending = new Map<string, PendingRead>()
  const listeners = new Set<(event: TerminalBridgeEvent<Events>) => void>()
  const retired = new Set<string>()
  let closed = false

  /** Settles a read once: removing it first makes every later settle a no-op. */
  function settle(id: string, action: (read: PendingRead) => void) {
    const read = pending.get(id)
    if (!read) return
    pending.delete(id)
    clearTimeout(read.timer)
    action(read)
  }

  /** Rejects reads for a retired generation. */
  function reject(id: string, error: TerminalError) {
    settle(id, read => read.reject(error))
  }

  return {
    get pending() {
      return pending.size
    },
    send(operation, args, sendOptions) {
      if (closed) return Promise.reject(new TerminalError('closed', 'Terminal bridge closed'))
      if (pending.size >= TERMINAL_BOUNDS.pendingReads) return Promise.reject(new TerminalError('busy', 'Too many pending reads'))
      const id = options.createId?.() ?? randomUUID()
      const command = { id, operation, args }
      if (!isBoundedCommand(command)) return Promise.reject(new TerminalError('invalid', 'Command exceeds the frame or identifier bounds'))
      return new Promise((resolve, rejectRead) => {
        const timer = setTimeout(() => reject(id, new TerminalError('timeout', `${operation} timed out`)), sendOptions?.timeout ?? options.timeoutMs ?? TERMINAL_BOUNDS.readTimeoutMs)
        // Pending reads must never keep the CLI alive.
        timer.unref()
        pending.set(id, { resolve, reject: rejectRead, timer })
        options.transport.send(command).then((result) => {
          if (result.ok === false) return reject(id, new TerminalError('unavailable', `Runtime is ${result.reason}`))
          if (retired.has(result.generation)) return reject(id, new TerminalError('retired', 'Runtime generation retired'))
          const read = pending.get(id)
          if (read) read.generation = result.generation
        }, () => reject(id, new TerminalError('unavailable', 'Runtime channel failed')))
      })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    receive(message) {
      if (closed || retired.has(message.generation)) return
      if (message.type === 'runtime-event') {
        const event = { generation: message.generation, event: message.event, data: message.data } as TerminalBridgeEvent<Events>
        for (const listener of [...listeners]) {
          try {
            listener(event)
          }
          catch {}
        }
        return
      }
      // A reply only settles the read it was addressed to, in the generation that answered it.
      const read = pending.get(message.id)
      if (!read || (read.generation !== undefined && read.generation !== message.generation)) return
      if (message.ok === false) settle(message.id, entry => entry.reject(new TerminalError(message.error.code as TerminalError['code'], message.error.message)))
      else settle(message.id, entry => entry.resolve(message.result))
    },
    retire(generation) {
      retired.add(generation)
      if (retired.size > RETIRED_MEMORY) retired.delete(retired.values().next().value!)
      for (const [id, read] of pending) {
        if (read.generation === generation) reject(id, new TerminalError('retired', 'Runtime generation retired'))
      }
    },
    close() {
      closed = true
      listeners.clear()
      for (const id of [...pending.keys()]) reject(id, new TerminalError('closed', 'Terminal bridge closed'))
    },
  }
}
