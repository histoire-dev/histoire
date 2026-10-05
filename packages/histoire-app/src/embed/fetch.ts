import { HISTOIRE_ERROR_CODES, HistoireSdkError } from '@histoire/protocol'

/** Reads bounded source-origin JSON incrementally instead of allocating an unlimited body. */
export async function readEmbedJson(url: URL, fetcher: typeof fetch, signal?: AbortSignal, maxBytes = 8 * 1024 * 1024, cache: RequestCache = 'default', input: Pick<RequestInit, 'method' | 'headers' | 'body'> = {}): Promise<unknown> {
  signal?.throwIfAborted()
  const response = await fetcher(url.href, { ...input, signal, cache, credentials: 'same-origin', redirect: 'error' })
  if (response.url && new URL(response.url).origin !== url.origin) throw new HistoireSdkError('ORIGIN_DENIED', 'Source asset left book origin')
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new HistoireSdkError('RESULT_TOO_LARGE', 'Source JSON exceeds size limit')
  }
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > maxBytes) throw new HistoireSdkError('RESULT_TOO_LARGE', 'Source JSON exceeds size limit')
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
    }
    catch (error) {
      await reader.cancel().catch(() => {})
      throw error
    }
    finally { reader.releaseLock() }
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch { throw new HistoireSdkError('BOOK_UNAVAILABLE', 'Source JSON is malformed or unavailable') }
  if (!response.ok) {
    const error = value as { code?: unknown }
    const code = HISTOIRE_ERROR_CODES.includes(error?.code as any) ? error.code as typeof HISTOIRE_ERROR_CODES[number] : 'BOOK_UNAVAILABLE'
    throw new HistoireSdkError(code, 'Source resource is unavailable')
  }
  return value
}

/** Cancels one consumer promptly without aborting source-owned shared index acquisition. */
export function waitEmbedSourceWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new HistoireSdkError('CANCELLED', 'Source request cancelled'))
    const finish = () => signal.removeEventListener('abort', aborted)
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
    void work.then((value) => {
      finish()
      resolve(value)
    }, (error) => {
      finish()
      reject(error)
    })
  })
}
