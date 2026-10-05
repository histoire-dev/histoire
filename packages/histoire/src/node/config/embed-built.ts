import type { HistoireSourceDescriptor } from '@histoire/protocol'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createEmbedFrameAncestors, resolveEmbedOrigins, validateHistoireSourceDescriptor } from '@histoire/protocol'

/** Reads bounded public policy JSON; absence differs from malformed present overrides. */
async function readPolicy(path: string): Promise<{ present: boolean, value?: unknown }> {
  try {
    const identity = await stat(path)
    if (!identity.isFile() || identity.size > 8 * 1024 * 1024) return { present: true }
    return { present: true, value: JSON.parse(await readFile(path, 'utf8')) }
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { present: false } : { present: true }
  }
}

/** Reads source framing policy once per acquired static/Node preview document generation. */
export async function readBuiltEmbedPolicy(publicRoot: string, options: { target: 'static' | 'node', originOverride?: string }) {
  const document = await readPolicy(join(publicRoot, 'histoire-embed.json'))
  if (!document.present) return undefined
  const descriptor: HistoireSourceDescriptor = validateHistoireSourceDescriptor(document.value)
  if (!descriptor.embed) throw new Error('Built embed descriptor has no origin policy')
  let override: { present: boolean, value?: unknown }
  if (options.target === 'node') {
    override = { present: options.originOverride !== undefined, value: options.originOverride?.split(',').map(origin => origin.trim()) }
  }
  else {
    const file = await readPolicy(join(publicRoot, 'histoire-embed-origins.json'))
    const value = file.value as { version?: unknown, allowedOrigins?: unknown } | undefined
    override = { present: file.present, value: value?.version === 1 ? value.allowedOrigins : undefined }
  }
  const allowedOrigins = resolveEmbedOrigins(descriptor.embed.allowedOrigins, override)
  return { allowedOrigins, header: createEmbedFrameAncestors(allowedOrigins) }
}
