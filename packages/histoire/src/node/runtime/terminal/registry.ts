import type { TerminalEventMap } from '@histoire/cli/protocol/core'
import type { TerminalEvents } from '@histoire/cli/protocol/index'
import type { RuntimeCatalog } from '../catalog/publication.js'
import type { ExecutionService } from '../execution-service.js'
import type { ProjectRuntimeHandle } from '../types.js'
import { TerminalError } from '@histoire/cli/protocol/core'

/** Everything a handler may touch; all of it dies with the generation. */
export interface TerminalHandlerContext<Events extends TerminalEventMap = TerminalEvents> {
  /** Proxy generation identity the command was addressed to. */
  generation: string
  /** Active project runtime generation. */
  handle: ProjectRuntimeHandle
  /** Canonical catalog attached to this generation, when publication is available. */
  catalog: RuntimeCatalog | undefined
  /** Terminal-scoped execution owner: cancelling it cancels only terminal submissions. */
  execution: ExecutionService
  /** Emits a bounded observation to the parent; dropped once the generation retires. */
  emit: <K extends keyof Events & string>(event: K, data: Events[K]) => void
  /** Aborted when the generation is released; handlers stop work and skip replies. */
  signal: AbortSignal
}

/** One private operation. Arguments arrive unvalidated: the handler owns its validators. */
export interface TerminalCommandHandler {
  /** Exact operation name, unique across all handlers. */
  operation: string
  /**
   * Runs the operation.
   * @param args Untrusted detached JSON from the parent.
   * @param context Generation-scoped capabilities.
   * @returns Detached JSON result within the frame bound.
   * @throws TerminalError for expected failures; anything else becomes `failed`.
   */
  handle: (args: unknown, context: TerminalHandlerContext) => Promise<unknown>
}

/** Dispatch table over registered handlers. */
export interface TerminalCommandRegistry {
  /** Registered operation names. */
  operations: () => string[]
  /** Runs a handler or rejects with an `unsupported` TerminalError. */
  dispatch: (operation: string, args: unknown, context: TerminalHandlerContext) => Promise<unknown>
}

/**
 * Builds the registry used by the adapter. Duplicate registrations are a
 * programming error and throw immediately at startup.
 * @param handlers Handlers contributed by domain modules.
 */
export function createCommandRegistry(handlers: readonly TerminalCommandHandler[]): TerminalCommandRegistry {
  const table = new Map<string, TerminalCommandHandler>()
  for (const handler of handlers) {
    if (table.has(handler.operation)) throw new Error(`Duplicate terminal operation: ${handler.operation}`)
    table.set(handler.operation, handler)
  }
  return {
    operations: () => [...table.keys()],
    async dispatch(operation, args, context) {
      const handler = table.get(operation)
      if (!handler) throw new TerminalError('unsupported', `Unsupported operation: ${operation}`)
      return handler.handle(args, context)
    },
  }
}
