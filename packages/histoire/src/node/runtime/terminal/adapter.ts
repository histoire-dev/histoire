import type { TerminalEvents } from '@histoire/cli/protocol/index'
import type { RuntimeEvent, RuntimeReply } from '@histoire/dev-proxy/protocol'
import type { ExecutionService } from '../execution-service.js'
import type { ProjectRuntimeHandle } from '../types.js'
import type { TerminalCommandHandler, TerminalHandlerContext } from './registry.js'
import { TerminalError } from '@histoire/cli/protocol/core'
import { isBoundedFrame, isRuntimeCommand } from '@histoire/dev-proxy/protocol'
import { getRuntimeCatalogForContext } from '../catalog/attachment.js'
import { createExecutionOwner } from '../execution-owner.js'
import { terminalHandlers } from './handlers/index.js'
import { createCommandRegistry } from './registry.js'

/** Inputs of the child-side terminal adapter. */
export interface TerminalAdapterOptions {
  /** Proxy generation this process serves; commands for any other are ignored. */
  generation: string
  /** Sends a frame to the parent over IPC; returns false when nothing was sent (disconnected). */
  send: (message: RuntimeReply | RuntimeEvent) => boolean
  /** Session execution lane the terminal-scoped owner is created over. */
  execution: () => ExecutionService
  /** Handler set; defaults to the shared list in `handlers/index.ts`. */
  handlers?: readonly TerminalCommandHandler[]
}

/** Resources that live exactly as long as one runtime generation. */
interface GenerationScope {
  handle: ProjectRuntimeHandle
  owner: ExecutionService
  abort: AbortController
}

/**
 * Creates the child-side terminal adapter. It attaches through the existing
 * generation lifecycle callbacks (`onGeneration`/`onBeforeRelease`), validates
 * `runtime-command` frames, and dispatches through the handler registry only.
 * It never creates a second server, collector, queue or listener.
 * @param options Wiring supplied by `dev-child`.
 */
export function createTerminalAdapter(options: TerminalAdapterOptions) {
  const registry = createCommandRegistry(options.handlers ?? terminalHandlers)
  let scope: GenerationScope | undefined
  let closed = false

  /** Emits an observation; oversized or post-close events are dropped (returns false). */
  function emit<K extends keyof TerminalEvents & string>(event: K, data: TerminalEvents[K]) {
    const message: RuntimeEvent = { type: 'runtime-event', generation: options.generation, event, data }
    if (closed || !isBoundedFrame(message)) return false
    return options.send(message)
  }

  /** Answers one command; late answers of a released generation are suppressed. */
  async function run(command: { id: string, operation: string, args?: unknown }) {
    const base = { type: 'runtime-reply', generation: options.generation, id: command.id } as const
    const current = scope
    if (!current || closed) {
      options.send({ ...base, ok: false, error: { code: 'unavailable', message: 'Runtime generation is not ready' } })
      return
    }
    const context: TerminalHandlerContext = {
      generation: options.generation,
      handle: current.handle,
      catalog: getRuntimeCatalogForContext(current.handle.context)?.catalog,
      execution: current.owner,
      emit: emit as TerminalHandlerContext['emit'],
      signal: current.abort.signal,
    }
    try {
      const result = await registry.dispatch(command.operation, command.args, context)
      if (scope !== current || closed) return
      if (!isBoundedFrame({ ...base, ok: true, result })) throw new TerminalError('failed', 'Result exceeds the frame bound')
      options.send({ ...base, ok: true, result })
    }
    catch (error) {
      if (scope !== current || closed) return
      const known = error instanceof TerminalError
      options.send({ ...base, ok: false, error: { code: known ? error.code : 'failed', message: String(error instanceof Error ? error.message : error).split('\n')[0].slice(0, 1024) } })
    }
  }

  return {
    /** Operation names currently served. */
    operations: registry.operations,
    /** Pass as (part of) `onGeneration`; opens the generation scope. */
    onGeneration(handle: ProjectRuntimeHandle) {
      scope = { handle, owner: createExecutionOwner(options.execution()), abort: new AbortController() }
    },
    /**
     * Pass as (part of) `onBeforeRelease`: stop admission first, then join
     * confirmed cleanup of terminal-owned work.
     */
    async onBeforeRelease(handle: ProjectRuntimeHandle) {
      const current = scope
      if (!current || current.handle !== handle) return
      scope = undefined
      current.abort.abort()
      await current.owner.close()
    },
    /**
     * Handles one raw IPC message.
     * @returns Whether it was a command for this generation (and was taken).
     */
    receive(raw: unknown) {
      if (!isRuntimeCommand(raw) || raw.generation !== options.generation) return false
      void run(raw)
      return true
    },
    emit,
    /** Stops all replies/events; hooks already installed elsewhere are restored by their owners. */
    close() {
      closed = true
      scope?.abort.abort()
    },
  }
}

/** Type of the adapter returned by {@link createTerminalAdapter}. */
export type TerminalAdapter = ReturnType<typeof createTerminalAdapter>
