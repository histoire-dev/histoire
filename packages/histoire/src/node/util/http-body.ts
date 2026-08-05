/**
 * Maximum size (in characters) of a body the dev server accepts.
 *
 * Story collection results are the biggest legitimate payload and stay orders
 * of magnitude below this; without a cap, any process able to reach the dev
 * server can grow the buffer until the server runs out of memory.
 */
export const MAX_REQUEST_BODY_SIZE = 32 * 1024 * 1024

/** Thrown when a request body exceeds {@link MAX_REQUEST_BODY_SIZE}. */
export class RequestBodyTooLargeError extends Error {
  constructor() {
    super(`Histoire dev server request body exceeds ${MAX_REQUEST_BODY_SIZE} bytes.`)
    this.name = 'RequestBodyTooLargeError'
  }
}

/**
 * Reads a whole HTTP request body as a UTF-8 string, up to
 * {@link MAX_REQUEST_BODY_SIZE}.
 *
 * Shared by every Histoire dev-server middleware that takes a JSON payload
 * from a browser runtime (story collection results, Vitest mock resolution).
 * @param req The incoming request stream.
 * @throws {RequestBodyTooLargeError} When the body exceeds the size cap.
 */
export function readRequestBody(req: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
    let body = ''
    req.setEncoding?.('utf8')
    req.on('data', (chunk) => {
      if (body.length + chunk.length > MAX_REQUEST_BODY_SIZE) {
        // Stop reading: the rest of the upload would keep growing the buffer.
        req.pause?.()
        reject(new RequestBodyTooLargeError())
        return
      }
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}
