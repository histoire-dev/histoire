import type { HistoireSourceDescriptor } from '@histoire/protocol'
import { HistoireSdkError, resolveEmbedOrigins, validateHistoireSourceDescriptor } from '@histoire/protocol'
import { readEmbedJson } from './fetch.js'

/** Requires complete first-party source fields after shared wire-shape validation. */
export function validateEmbedDescriptor(value: unknown): HistoireSourceDescriptor {
  const version = (value as { descriptorVersion?: unknown })?.descriptorVersion
  if (version !== 1) throw new HistoireSdkError('PROTOCOL_MISMATCH', 'Unsupported source descriptor version')
  const descriptor = validateHistoireSourceDescriptor(value)
  if (!descriptor.embed || !descriptor.assets || !descriptor.config) throw new HistoireSdkError('PROTOCOL_MISMATCH', 'Source descriptor lacks required portable fields')
  return descriptor
}

/** Reads own-origin descriptor; host URL never controls a content resource. */
export async function loadEmbedDescriptor(base: URL, fetcher: typeof fetch, signal?: AbortSignal): Promise<HistoireSourceDescriptor> {
  return validateEmbedDescriptor(await readEmbedJson(new URL('histoire-embed.json', base), fetcher, signal, undefined, 'no-store'))
}

/** Resolves static deployment policy before handshake; missing keeps baked list, malformed closes it. */
export async function loadEmbedOrigins(base: URL, descriptor: HistoireSourceDescriptor, fetcher: typeof fetch, signal?: AbortSignal): Promise<readonly string[]> {
  if (descriptor.mode !== 'static') return resolveEmbedOrigins(descriptor.embed.allowedOrigins)
  let present = true
  let value: unknown
  try {
    const url = new URL('histoire-embed-origins.json', base)
    const response = await fetcher(url.href, { signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error' })
    if (response.url && new URL(response.url).origin !== base.origin) throw new Error('Override left book origin')
    if (response.status === 404) {
      present = false
    }
    else if (response.ok) {
      const document = await readEmbedJson(url, async () => response, signal, 64 * 1024, 'no-store') as { version?: unknown, allowedOrigins?: unknown }
      if (document?.version === 1) value = document.allowedOrigins
    }
  }
  catch { signal?.throwIfAborted() }
  return resolveEmbedOrigins(descriptor.embed.allowedOrigins, { present, value })
}
