import type { HistoireSourceDescriptor } from '@histoire/protocol'
import type { Context } from '../../context.js'
import type { EmbedSource } from './source.js'
import { createEmbedDescriptor } from './descriptor.js'
import { writeSourceAsset, writeSourceContent } from './output.js'

/** Emits standalone lazy data without creating opt-in public bridge documents. */
export async function prepareLocalSourceOutput(source: EmbedSource, outputRoot: string): Promise<void> {
  await writeSourceContent(source, outputRoot)
}

/** Commits local identity metadata after final browser assets have their build identity. */
export async function writeLocalSourceDescriptor(ctx: Context, source: EmbedSource, outputRoot: string, buildId: string): Promise<HistoireSourceDescriptor> {
  const descriptor = createEmbedDescriptor(ctx, source.catalog.current, 'static', buildId, 'local')
  await writeSourceAsset(outputRoot, 'assets/histoire-local.json', descriptor)
  return descriptor
}
