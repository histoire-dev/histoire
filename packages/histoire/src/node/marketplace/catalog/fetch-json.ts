import { Buffer } from 'node:buffer'
import { CatalogNotFoundError } from './errors.js'

/** Read bounded streaming JSON, including chunked bodies lacking content-length. */
export async function fetchMarketplaceJson(url: string, bytes: number, signal: AbortSignal, authorization?: string, source = 'Registry'): Promise<unknown> {
  const response = await fetch(url, { signal, redirect: 'error', headers: { accept: 'application/json', ...(authorization ? { authorization } : {}) } })
  if (!response.ok) {
    await response.body?.cancel()
    if (response.status === 404) throw new CatalogNotFoundError()
    throw new Error(`${source} HTTP ${response.status} (${new URL(url).host})`)
  }
  if (Number(response.headers.get('content-length')) > bytes) {
    await response.body?.cancel()
    throw new Error(`${source} response too large`)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error(`${source} response is empty`)
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > bytes) throw new Error(`${source} response too large`)
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
