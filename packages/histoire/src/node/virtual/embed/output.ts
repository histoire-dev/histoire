import type { HistoireSourceDescriptor } from '@histoire/protocol'
import type { Context } from '../../context.js'
import type { EmbedSource } from './source.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createEmbedFrameAncestors } from '@histoire/protocol'
import { generateEmbedHtml } from '../../build/html.js'
import { resolveEmbedConfig } from '../../config/embed.js'
import { projectEmbedContent } from './content.js'
import { createEmbedDescriptor } from './descriptor.js'

/** Prepared source assets retain one captured completed publication until descriptor commit. */
export interface PreparedEmbedOutput {
  /** Completed source capture, never serialized directly. */
  source: EmbedSource
  /** Portable dev-shaped descriptor before final static identity is known. */
  descriptor: HistoireSourceDescriptor
}

/** Writes one owned public lazy JSON asset, creating only its relative parent directory. */
export async function writeSourceAsset(outputRoot: string, path: string, value: unknown): Promise<void> {
  const output = join(outputRoot, path)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(value), 'utf8')
}

/** Shared exact-target lazy bodies serve standalone and public embeds from one content provider. */
export async function writeSourceContent(source: EmbedSource, outputRoot: string): Promise<void> {
  const descriptor = source.getDescriptor()
  for (const entry of descriptor.assets.content) {
    if (entry.docs) await writeSourceAsset(outputRoot, entry.docs, projectEmbedContent(await source.getDocs(entry.storyId, descriptor.revision)))
    if (entry.rawSource) await writeSourceAsset(outputRoot, entry.rawSource, projectEmbedContent(await source.getSource(entry.storyId, descriptor.revision)))
  }
  await writeSourceAsset(outputRoot, descriptor.assets.search, source.getSearch())
}

/** Emits identity-free content/search/bootstrap before immutable build identity is calculated. */
export async function prepareEmbedOutput(ctx: Context, source: EmbedSource, outputRoot: string, bundleFile: string, styleFile?: string): Promise<PreparedEmbedOutput | undefined> {
  if (!resolveEmbedConfig(ctx.config.embed).enabled) return
  const descriptor = source.getDescriptor()
  await writeSourceContent(source, outputRoot)
  await writeFile(join(outputRoot, '__embed.html'), generateEmbedHtml(bundleFile, ctx, styleFile), 'utf8')
  await writeFile(join(outputRoot, 'histoire-embed-headers.txt'), `Apply on ${ctx.resolvedViteConfig.base}index.html, __embed.html, __sandbox.html, and error responses:
Content-Security-Policy: ${createEmbedFrameAncestors(descriptor.embed.allowedOrigins)}

Preserve all other Content-Security-Policy directives and independent policies.
When histoire-embed-origins.json replaces allowedOrigins, use that effective list in framing headers.
Keep X-Frame-Options consistent with intended allowed parents; DENY or SAMEORIGIN can block them.
`, 'utf8')
  return { source, descriptor }
}

/** Commits excluded identity metadata after all hashed runtime assets have their final bytes. */
export async function writeEmbedDescriptor(ctx: Context, prepared: PreparedEmbedOutput | undefined, outputRoot: string, buildId: string): Promise<HistoireSourceDescriptor | undefined> {
  if (!prepared) return
  const descriptor = createEmbedDescriptor(ctx, prepared.source.catalog.current, 'static', buildId)
  await writeSourceAsset(outputRoot, 'histoire-embed.json', descriptor)
  return descriptor
}
