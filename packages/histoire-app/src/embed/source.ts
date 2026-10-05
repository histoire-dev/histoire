import type { HistoireSourceSearchData } from '@histoire/protocol'
import type { HistoireRequestCapture, HistoireSessionCommand } from '@histoire/sdk/internal'
import type { EmbedSourceConnection, EmbedSourceOptions } from './types.js'
import { HistoireSdkError, validateBridgePayload, validateBridgeResult, validateWireValue } from '@histoire/protocol'
import { loadEmbedDescriptor, loadEmbedOrigins, validateEmbedDescriptor } from './descriptor.js'
import { readEmbedJson, waitEmbedSourceWork } from './fetch.js'
import { searchEmbedData, validateEmbedSearch } from './search.js'
import { createEmbedSubscriptions } from './subscriptions.js'

/** Local lifetime IDs also work on plain HTTP without crypto.randomUUID. */
let nextConnection = 0

/** Creates source-document transport explicitly; imports safely in SSR and mounts no story. */
export async function createEmbedSourceConnection(options: EmbedSourceOptions): Promise<EmbedSourceConnection> {
  const base = new URL(options.url)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) throw new HistoireSdkError('INVALID_ARGUMENT', 'Expected HTTP(S) book base URL')
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  let descriptor = options.descriptor ? structuredClone(validateEmbedDescriptor(options.descriptor)) : await loadEmbedDescriptor(base, fetcher, options.signal)
  const allowedOrigins = options.descriptor ? [] : await loadEmbedOrigins(base, descriptor, fetcher, options.signal)
  const actionBase = options.actionBase ?? '__histoire/embed/'
  if (!['__histoire/embed/', '__histoire/local/'].includes(actionBase)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Unknown first-party action route')
  options.signal?.throwIfAborted()
  const id = `source-${Date.now()}-${++nextConnection}`
  const abort = new AbortController()
  let closed = false
  let search: { revision: string, promise: Promise<HistoireSourceSearchData> } | undefined
  const subscriptions = createEmbedSubscriptions(id, descriptor, options.subscribe, (value) => {
    descriptor = value
    search = undefined
  })

  /** Rejects stale captured work before and after every asynchronous source read. */
  function assertOwner(capture: HistoireRequestCapture): void {
    capture.signal.throwIfAborted()
    if (closed) throw new HistoireSdkError('NOT_CONNECTED', 'Source connection is closed')
    if (capture.connectionId !== id || capture.sourceId !== descriptor.sourceId || capture.epoch !== descriptor.epoch || capture.revision !== descriptor.revision) throw new HistoireSdkError('STALE_REVISION', 'Source publication changed')
  }

  /** Exact catalog lookup prevents caller strings from becoming resource paths. */
  function story(storyId: string, variantId?: string) {
    const matches = descriptor.catalog.stories.filter(story => story.id === storyId)
    if (!matches.length) throw new HistoireSdkError('STORY_NOT_FOUND', 'Story does not exist')
    if (matches.length > 1) throw new HistoireSdkError('STORY_AMBIGUOUS', 'Story ID is ambiguous')
    if (variantId !== undefined && !matches[0].variants.some(variant => variant.id === variantId)) throw new HistoireSdkError('VARIANT_NOT_FOUND', 'Variant does not exist')
    return matches[0]
  }

  /** Data-only finite command dispatch; runtime execution belongs to explicit later adapters. */
  async function request<T = unknown>(command: HistoireSessionCommand, payload: unknown, capture: HistoireRequestCapture): Promise<T> {
    assertOwner(capture)
    validateWireValue(payload, { kind: 'request', name: command })
    validateBridgePayload(command, payload)
    const input = payload as { storyId?: string, variantId?: string, mode?: string, query?: string }
    const signal = AbortSignal.any([abort.signal, capture.signal])
    let result: unknown
    if (command === 'catalog.search') {
      if (!search || search.revision !== descriptor.revision) {
        // Cached index belongs to source lifetime, so one caller cancellation
        // cannot abort another concurrent read of the same completed index.
        const promise = readEmbedJson(new URL(descriptor.assets.search, base), fetcher, abort.signal).then(validateEmbedSearch)
        search = { revision: descriptor.revision, promise }
        void promise.catch(() => {
          if (search?.promise === promise) search = undefined
        })
      }
      result = searchEmbedData(await waitEmbedSourceWork(search.promise, capture.signal), input.query)
    }
    else if (command === 'docs.get' || command === 'source.get') {
      story(input.storyId, input.variantId)
      if (command === 'source.get' && input.mode !== 'raw') throw new HistoireSdkError('PREVIEW_NOT_READY', 'Dynamic source requires ready runtime')
      const entry = descriptor.assets.content.find(entry => entry.storyId === input.storyId)
      const reference = command === 'docs.get' ? entry?.docs : entry?.rawSource
      if (!reference) throw new HistoireSdkError(command === 'docs.get' ? 'DOCS_NOT_FOUND' : 'SOURCE_UNAVAILABLE', 'Requested source content is unavailable')
      const body = await readEmbedJson(new URL(reference, base), fetcher, signal, 1024 * 1024) as Record<string, unknown>
      if (body.storyId !== input.storyId) throw new HistoireSdkError('INVALID_ARGUMENT', 'Source asset target differs')
      result = { ...body, epoch: capture.epoch, revision: capture.revision, ...(input.variantId === undefined ? {} : { variantId: input.variantId }) }
    }
    else if (command === 'tests.run') {
      if (input.mode !== 'server' || descriptor.mode !== 'dev' || !descriptor.capabilities.serverTests.available) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Server test engine unavailable')
      if (!capture.target?.variantId) throw new HistoireSdkError('VARIANT_NOT_FOUND', 'Tests require selected variant')
      story(capture.target.storyId, capture.target.variantId)
      result = await readEmbedJson(new URL(`${actionBase}tests`, base), fetcher, signal, 1024 * 1024, 'no-store', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target: capture.target, epoch: capture.epoch, revision: capture.revision }) })
    }
    else if (command === 'openInEditor') {
      if (descriptor.mode !== 'dev' || !descriptor.capabilities.openInEditor.available) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Editor is available only in dev')
      story(input.storyId, input.variantId ?? undefined)
      const url = new URL(`${actionBase}editor`, base)
      const response = await fetcher(url.href, { signal, credentials: 'same-origin', redirect: 'error', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target: payload, epoch: capture.epoch, revision: capture.revision }) })
      if (!response.ok) await readEmbedJson(url, async () => response, signal, 64 * 1024)
      await response.body?.cancel()
      result = null
    }
    else {
      throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Command requires runtime or server adapter')
    }
    assertOwner(capture)
    validateBridgeResult(command, result)
    return result as T
  }
  return {
    id,
    get descriptor() { return descriptor },
    allowedOrigins,
    initialSettings: { colorScheme: descriptor.config.theme.defaultColorScheme, globals: descriptor.config.globals ?? {}, textDirection: descriptor.config.textDirection ?? 'ltr' },
    request,
    subscribe: subscriptions.subscribe,
    /** Cancels active fetches and source observations before resources can publish again. */
    close() {
      if (closed) return
      closed = true
      abort.abort()
      subscriptions.close()
    },
  }
}

export type { EmbedSourceConnection, EmbedSourceOptions } from './types.js'
