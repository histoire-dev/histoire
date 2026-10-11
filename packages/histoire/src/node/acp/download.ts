import { Buffer } from 'node:buffer'
/** Download bounded bytes without allowing a response body to outlive timeout/retirement. */
export async function downloadAgentArchive(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) })
  if (!response.ok || !response.body) throw new Error('Cannot download agent archive')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 512 * 1024 * 1024) throw new Error('Agent archive too large')
      chunks.push(next.value)
    }
  }
  finally { await reader.cancel().catch(() => {}) }
  signal.throwIfAborted()
  return Buffer.concat(chunks)
}
