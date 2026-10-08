import type { HistoireEmbedDocumentOptions } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { createEmbedDocumentLifecycle } from './lifecycle.js'
import type { EmbedSourceConnection } from './types.js'
import { HistoireSdkError, parseEmbedDocumentOptions } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { createApp, h, shallowRef } from 'vue'
import { mountLocalHistoireSurface } from './adapters/local-mount.js'
import EmbedDocument from './EmbedDocument.vue'

/** Self-starting public document owns a session; external parents receive no command bridge. */
export function bootstrapDirectEmbed(source: Promise<EmbedSourceConnection>, base: string, lifecycle: ReturnType<typeof createEmbedDocumentLifecycle>): void {
  if (lifecycle.signal.aborted) return
  const session = shallowRef<HistoireSession>()
  const options = shallowRef<HistoireEmbedDocumentOptions>()
  const failure = shallowRef<string>()
  let owned: HistoireSession | undefined
  /** Ignore retired document errors and strip runtime-only jargon from visible failures. */
  function fail(error: unknown): void {
    if (lifecycle.signal.aborted) return
    console.error('[histoire] Embed failed', error)
    failure.value = error instanceof HistoireSdkError && ['STORY_NOT_FOUND', 'STORY_AMBIGUOUS', 'VARIANT_NOT_FOUND', 'INVALID_ARGUMENT'].includes(error.code)
      ? error.message
      : 'Variant failed to load'
  }
  const app = createApp({ render: () => h(EmbedDocument, { session: session.value, options: options.value, error: failure.value, onError: fail }) })
  app.mount(document.body)
  // Register before asynchronous acquisition: a removed iframe must also close
  // any connection acquired after pagehide, without mounting late story modules.
  lifecycle.add(() => app.unmount())
  lifecycle.add(() => owned?.dispose())
  /** Metadata and exact target admission finish before the primary is rendered. */
  async function start(): Promise<void> {
    options.value = parseEmbedDocumentOptions(new URL(location.href).searchParams)
    owned = createHistoireSessionWithAdapters({ url: base }, {
      connect: () => source,
      mount: context => mountLocalHistoireSurface(context, base),
    })
    await owned.connect()
    lifecycle.signal.throwIfAborted()
    const story = await owned.catalog.getStory(options.value.storyId)
    if (story.docsOnly || !story.variants.length) throw new HistoireSdkError('VARIANT_NOT_FOUND', 'Story has no embeddable variants')
    const variantId = options.value.variantId ?? story.variants[0].id
    await owned.selection.select({ storyId: story.id, variantId })
    lifecycle.signal.throwIfAborted()
    session.value = owned
  }
  void start().catch(fail)
}
