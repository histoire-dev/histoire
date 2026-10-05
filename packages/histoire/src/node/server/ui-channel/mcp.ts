import type { UiMcpSnapshot } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { DevMcpObserver } from '../../mcp/observer/context.js'
import type { UiChannelClient, UiChannelServer } from './types.js'
import { fileURLToPath } from 'node:url'
import { getMcpObserver, onMcpObserverChange } from '../../mcp/observer/context.js'
import { McpDomainError, toMcpError } from '../../mcp/protocol/errors.js'
import { boundMcpSnapshot } from './mcp-snapshot.js'
import { uiMcpCancelSchema } from './validation.js'

/** Installed CLI wrapper has the same relative position in source and emitted modules. */
export function uiStdioConfig(ctx: Pick<Context, 'root' | 'configFile'>): NonNullable<UiMcpSnapshot['stdio']> {
  const args = [fileURLToPath(new URL('../../../../bin.mjs', import.meta.url)), 'mcp', '--root', ctx.root]
  if (ctx.configFile) args.push('--config', ctx.configFile)
  return { command: process.execPath, args }
}

/** Project's dev observer arrives after Vite startup; attach without polling. */
export function registerMcpChannel(ctx: Context, channel: UiChannelServer) {
  let observer: DevMcpObserver | undefined
  let offClients: (() => void) | undefined
  let offOperations: (() => void) | undefined
  /** Missing observer is a disabled server until runtime supplies policy. */
  function snapshot(): UiMcpSnapshot {
    return boundMcpSnapshot({ ...(observer?.snapshot() ?? { status: 'disabled', clients: [], operations: [] }), stdio: uiStdioConfig(ctx) })
  }
  /** Fresh snapshots replace running states from a superseded runtime. */
  function sendSnapshot(client?: UiChannelClient) {
    channel.send('histoire:ui:mcp-snapshot', snapshot(), client)
  }
  /** Replace subscriptions before exposing the next runtime generation. */
  function attach(next: DevMcpObserver | undefined) {
    offClients?.()
    offOperations?.()
    observer = next
    offClients = next?.onClientChange(() => sendSnapshot())
    offOperations = next?.onOperationChange(value => channel.send('histoire:ui:mcp-operation', value))
    sendSnapshot()
  }
  attach(getMcpObserver(ctx))
  channel.addCleanup(onMcpObserverChange(ctx, attach))
  channel.addCleanup(() => {
    offClients?.()
    offOperations?.()
  })
  channel.onReady(sendSnapshot)
  channel.on('histoire:ui:mcp-cancel', value => uiMcpCancelSchema.parse(value), async ({ operationId }, client) => {
    try {
      if (!observer) throw new McpDomainError('CAPABILITY_UNAVAILABLE', 'MCP status unavailable.')
      await observer.cancelFromUi(operationId)
      channel.send('histoire:ui:mcp-cancel-result', { operationId }, client)
    }
    catch (error) {
      const value = toMcpError(error)
      channel.send('histoire:ui:mcp-cancel-result', { operationId, error: { code: value.code === 'OPERATION_NOT_FOUND' || value.code === 'CAPABILITY_UNAVAILABLE' ? 'unavailable' : 'failed', message: value.message } }, client)
    }
  })
}
