import type { CompleteElicitationNotification, CreateElicitationRequest, CreateElicitationResponse, RequestPermissionRequest, RequestPermissionResponse, SessionNotification } from '@agentclientprotocol/sdk'
import type { launchAgentProcess } from './agent-process.js'
import { Readable, Writable } from 'node:stream'
import { client, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'

/** Client-owned ACP callbacks; each request receives the agent's cancellation signal. */
export interface AgentClientHandlers {
  /** Mediates agent-owned tool authorization; client does not edit source files. */
  permission: (params: RequestPermissionRequest, signal?: AbortSignal) => Promise<RequestPermissionResponse>
  /** Asks the user for structured input or to visit a link. */
  elicitation: (params: CreateElicitationRequest, signal?: AbortSignal) => Promise<CreateElicitationResponse>
  /** Agent finished a link elicitation out of band. */
  elicitationComplete: (params: CompleteElicitationNotification) => void
  /** Receives reply/diff notifications. */
  update: (params: SessionNotification) => void
}

/** Connects official ACP SDK v1 with only supported, client-owned callbacks. */
export function connectAgentClient(process: ReturnType<typeof launchAgentProcess>, handlers: AgentClientHandlers) {
  // The SDK walks handlers in order with one await each; session updates come first so
  // reply chunks are routed before the prompt response that follows them settles.
  const connection = client({ name: 'histoire' })
    .onNotification(methods.client.session.update, context => handlers.update(context.params))
    .onRequest(methods.client.session.requestPermission, context => handlers.permission(context.params, context.signal))
    .onRequest(methods.client.elicitation.create, context => handlers.elicitation(context.params, context.signal))
    .onNotification(methods.client.elicitation.complete, context => handlers.elicitationComplete(context.params))
    .connect(ndJsonStream(Writable.toWeb(process.child.stdin) as unknown as WritableStream<Uint8Array>, Readable.toWeb(process.child.stdout) as ReadableStream<Uint8Array>, { maxMessageBytes: 1024 * 1024 }))
  /** Initial negotiation never advertises source writing or terminal hosting; forms and links render in threads. */
  async function initialize() {
    const result = await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'histoire', version: '1.0.0' },
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, elicitation: { form: {}, url: {} } },
    })
    if (result.protocolVersion !== PROTOCOL_VERSION) throw new Error(`ACP protocol version mismatch: expected ${PROTOCOL_VERSION}, received ${result.protocolVersion}`)
    return result
  }
  return { connection, initialize }
}
