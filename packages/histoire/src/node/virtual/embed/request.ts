import type { IncomingMessage } from 'node:http'
import { Buffer } from 'node:buffer'
import { HistoireSdkError } from '@histoire/protocol'

/** Shared finite server actions accept bounded same-origin JSON POST only. */
export async function readEmbedActionInput(request: IncomingMessage): Promise<unknown> {
  if (request.method !== 'POST' || !request.headers['content-type']?.startsWith('application/json') || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) throw new HistoireSdkError('INVALID_ARGUMENT', 'Same-origin JSON POST required')
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > 64 * 1024) throw new HistoireSdkError('INVALID_ARGUMENT', 'Action request too large')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  catch { throw new HistoireSdkError('INVALID_ARGUMENT', 'Invalid action request JSON') }
}
