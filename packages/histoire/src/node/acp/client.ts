import type { RequestPermissionRequest, RequestPermissionResponse, SessionNotification } from '@agentclientprotocol/sdk'
import type { launchAgentProcess } from './agent-process.js'
import { Readable, Writable } from 'node:stream'
import { client, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'

/** Connects official ACP SDK v1 with only supported, client-owned callbacks. */
export function connectAgentClient(process: ReturnType<typeof launchAgentProcess>, handlers: {
  /** Mediates agent-owned tool authorization; client does not edit source files. */
  permission: (params: RequestPermissionRequest) => Promise<RequestPermissionResponse>
  /** Receives reply/diff notifications. */
  update: (params: SessionNotification) => void
}) {
  const connection = client({ name: 'histoire' })
    .onRequest(methods.client.session.requestPermission, context => handlers.permission(context.params))
    .onNotification(methods.client.session.update, context => handlers.update(context.params))
    .connect(ndJsonStream(Writable.toWeb(process.child.stdin) as unknown as WritableStream<Uint8Array>, Readable.toWeb(process.child.stdout) as ReadableStream<Uint8Array>, { maxMessageBytes: 1024 * 1024 }))
  /** Initial negotiation never advertises source writing or terminal hosting. */
  async function initialize() {
    const result = await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'histoire', version: '1.0.0' },
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    })
    if (result.protocolVersion !== PROTOCOL_VERSION) throw new Error(`ACP protocol version mismatch: expected ${PROTOCOL_VERSION}, received ${result.protocolVersion}`)
    return result
  }
  return { connection, initialize }
}
