import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TLSSocket } from 'node:tls'
import { Buffer } from 'node:buffer'

/** Default JSON body cap shared by UI HTTP routes. */
export const JSON_BODY_BYTES = 64 * 1024

/** Thrown when a request body exceeds its route limit; routes map it to their own message. */
export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large')
    this.name = 'RequestBodyTooLargeError'
  }
}

/**
 * Rejects cross-origin browser writes (credentials, uploads) before reading the body:
 * POST only, exact content type, and an `Origin` matching the request host and protocol.
 * @param request Incoming request.
 * @param contentType Required media type, ignoring parameters.
 */
export function isSameOriginPost(request: IncomingMessage, contentType = 'application/json'): boolean {
  if (request.method !== 'POST' || !request.headers.origin || !request.headers.host || request.headers['content-type']?.split(';')[0] !== contentType) return false
  try {
    const origin = new URL(request.headers.origin)
    const protocol = (request.socket as TLSSocket)?.encrypted ? 'https:' : 'http:'
    return origin.protocol === protocol && origin.origin === request.headers.origin && !origin.username && !origin.password && origin.host === request.headers.host
  }
  catch { return false }
}

/**
 * Reads a whole request body, stopping as soon as it exceeds `limit` bytes.
 * @param request Incoming request.
 * @param limit Largest accepted body in bytes.
 * @throws {RequestBodyTooLargeError} When the body is larger than `limit`.
 */
export async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > limit) throw new RequestBodyTooLargeError()
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/**
 * Reads and parses a bounded JSON body without logging private payloads.
 * @param request Incoming request.
 * @param limit Largest accepted body in bytes.
 */
export async function readJsonBody(request: IncomingMessage, limit = JSON_BODY_BYTES): Promise<unknown> {
  return JSON.parse((await readBody(request, limit)).toString('utf8'))
}

/**
 * Writes one JSON response.
 * @param response Outgoing response.
 * @param status HTTP status.
 * @param value JSON-serializable body.
 */
export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(value))
}
