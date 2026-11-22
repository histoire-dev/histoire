import type { CatalogPage, CatalogQuery, ChangePlan, ChangeRequest, JobState, MarketplaceError, MarketplaceJobEvent, MarketplacePrefs, MarketplaceUpdate, PluginDetail, UiClientEvents, UiServerEvents } from '@histoire/shared'
import { catalogFacets, catalogPageSize, filterCatalog, manualConfigSteps, packageCommand, searchCatalog, sortCatalog } from '@histoire/shared'
import { createClientUuid } from './dev-event-api.js'
import { isUiChannelAvailable, onUiEvent, sendUiEvent } from './ui-channel'

/** Transport boundary shared by development HMR and transport tests. */
export interface MarketplaceTransport {
  /** Whether a live development channel exists. */ available: () => boolean
  /** Send a bounded channel event. */ send: (event: keyof UiClientEvents, value: any) => boolean
  /** Observe a channel reply until detached. */ on: (event: keyof UiServerEvents, listener: (value: any) => void) => () => void
}
/** Per-request cancellation and deadline. */
export interface MarketplaceRequestOptions {
  /** Stop listening without cancelling a server-owned project job. */ signal?: AbortSignal
  /** Override the default request deadline. */ timeoutMs?: number
}
/** Client dependencies; defaults use the workbench's existing channel. */
export interface MarketplaceClientOptions {
  /** External transport boundary. */ transport?: MarketplaceTransport
  /** Lazy bundled index; slice 02 supplies the production virtual module. */ loadOfficial?: () => Promise<PluginDetail[]>
  /** Default deadline in milliseconds. */ timeoutMs?: number
}
/** Keep server error codes available to wizard recovery actions. */
function requestError(error: MarketplaceError): Error & MarketplaceError {
  return Object.assign(new Error(error.message), error)
}
/** Count facets over the actual offline result set. */
function staticPage(entries: PluginDetail[], query: CatalogQuery): CatalogPage {
  const collection = query.filters?.collection
  const members = collection ? entries.filter(entry => entry.manifest.collections?.includes(collection)) : entries
  const ranked = searchCatalog(members, query.query)
  const matches = sortCatalog(filterCatalog(ranked, query.filters), query.sort)
  const facets = catalogFacets(ranked, query.filters)
  const offset = Math.max(0, Number.parseInt(query.cursor ?? '0', 10) || 0)
  const limit = Math.max(1, Math.min(60, query.limit ?? catalogPageSize))
  return {
    entries: matches.slice(offset, offset + limit),
    total: matches.length,
    ...(offset + limit < matches.length ? { cursor: String(offset + limit) } : {}),
    facets,
    project: { frameworks: [], signals: [] },
    sources: { official: 'ok', community: 'off' },
  }
}
/** Provide copyable, non-executable instructions in static books. */
function staticPlan(request: ChangeRequest, detail: PluginDetail): ChangePlan {
  const name = request.prefs.packageManager === 'auto' ? 'npm' : request.prefs.packageManager
  const removing = request.kind === 'remove'
  const command = packageCommand({ name, workspaceRoot: false }, { ...request, version: request.version ?? detail.latest })
  return {
    planId: `static:${detail.id}`,
    hash: '',
    packageManager: { name, source: 'override' },
    files: [],
    warnings: [],
    manual: { reason: 'static', steps: [
      ...(request.kind === 'options' ? [] : [{ title: removing ? 'Remove package' : 'Install package', code: command!.display }]),
      ...manualConfigSteps(request, detail),
    ] },
  }
}
/** Create correlated wrappers without capturing transport authority in static builds. */
export function createMarketplaceClient(options: MarketplaceClientOptions = {}) {
  const transport = options.transport ?? { available: isUiChannelAvailable, send: sendUiEvent, on: onUiEvent }
  const loadOfficial = options.loadOfficial ?? (() => import('virtual:$histoire-marketplace-official').then(module => module.officialPlugins))

  /** One request owner handles correlation, abort, deadline and synchronous send errors. */
  function request<T>(event: keyof UiClientEvents, result: keyof UiServerEvents, field: string, payload: Record<string, unknown>, requestOptions: MarketplaceRequestOptions = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const signal = requestOptions.signal
      if (signal?.aborted) {
        reject(new DOMException('Request aborted', 'AbortError'))
        return
      }
      if (!transport.available()) {
        reject(requestError({ code: 'unavailable', message: 'Plugin jobs require a development server' }))
        return
      }
      const requestId = createClientUuid()
      let off = () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      let settled = false
      /** Release every acquired listener even if transport send throws. */
      function finish(error?: unknown, value?: T): void {
        if (settled) return
        settled = true
        off()
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve(value!)
      }
      /** Abort only this browser listener; explicit cancelJob owns job cancellation. */
      function abort(): void {
        finish(new DOMException('Request aborted', 'AbortError'))
      }
      try {
        off = transport.on(result, (reply) => {
          if (reply?.requestId !== requestId) return
          if (reply.error) finish(requestError(reply.error))
          else if (Object.hasOwn(reply, field)) finish(undefined, reply[field])
        })
        signal?.addEventListener('abort', abort, { once: true })
        timer = setTimeout(() => finish(new Error('Plugin marketplace request timed out')), requestOptions.timeoutMs ?? options.timeoutMs ?? 15_000)
        // The listener is installed before sending: in-memory and fast replies are valid.
        if (signal?.aborted) abort()
        else if (!transport.send(event, { ...payload, requestId })) finish(requestError({ code: 'unavailable', message: 'Plugin marketplace is unavailable' }))
      }
      catch (error) { finish(error) }
    })
  }
  /** Read bundled metadata or throw a stable unknown-package error. */
  async function offlineDetail(id: string, requestOptions?: MarketplaceRequestOptions): Promise<PluginDetail> {
    requestOptions?.signal?.throwIfAborted()
    const entries = await loadOfficial()
    requestOptions?.signal?.throwIfAborted()
    const detail = entries.find(entry => entry.id === id)
    if (!detail) throw requestError({ code: 'not-found', message: 'Plugin not found' })
    const versions = detail.versions.map(version => !version.compatible && !version.reason
      ? { ...version, reason: (version.version === detail.latest ? detail.compatible.reason : undefined) ?? 'Incompatible with this project' }
      : version)
    return { ...detail, versions }
  }
  return {
    /** Query catalog; static books never contact the registry. */
    async catalog(query: CatalogQuery, requestOptions?: MarketplaceRequestOptions): Promise<CatalogPage> {
      if (transport.available()) return request('histoire:ui:marketplace-catalog', 'histoire:ui:marketplace-catalog-result', 'page', { query }, requestOptions)
      requestOptions?.signal?.throwIfAborted()
      const entries = await loadOfficial()
      requestOptions?.signal?.throwIfAborted()
      return staticPage(entries, query)
    },
    /** Read declarative plugin details. */
    detail(id: string, prefs: MarketplacePrefs, requestOptions?: MarketplaceRequestOptions & {
      /** Exact published release for install options. */ version?: string
    }): Promise<PluginDetail> {
      const version = requestOptions?.version
      return transport.available() ? request('histoire:ui:marketplace-detail', 'histoire:ui:marketplace-detail-result', 'detail', { id, prefs, ...(version ? { version } : {}) }, requestOptions) : offlineDetail(id, requestOptions)
    },
    /** Read compatible target notes and migrations from the development server. */
    updateDetail(id: string, prefs: MarketplacePrefs, requestOptions?: MarketplaceRequestOptions): Promise<PluginDetail> {
      return request('histoire:ui:marketplace-update-detail', 'histoire:ui:marketplace-update-detail-result', 'detail', { id, prefs }, requestOptions)
    },
    /** Prepare changes, or copyable manual instructions in a static book. */
    async plan(change: ChangeRequest, requestOptions?: MarketplaceRequestOptions): Promise<ChangePlan> {
      if (transport.available()) return request('histoire:ui:marketplace-plan', 'histoire:ui:marketplace-plan-result', 'plan', { request: change }, requestOptions)
      return staticPlan(change, await offlineDetail(change.id, requestOptions))
    },
    /** Start a reviewed plan; completion comes from subscribeJob. */
    startJob(planId: string, hash: string, requestOptions?: MarketplaceRequestOptions): Promise<JobState> {
      return request('histoire:ui:marketplace-job-start', 'histoire:ui:marketplace-job-state', 'job', { planId, hash }, requestOptions)
    },
    /** Read current or most recent job. */
    currentJob(requestOptions?: MarketplaceRequestOptions): Promise<JobState | null> {
      return request('histoire:ui:marketplace-job-current', 'histoire:ui:marketplace-job-state', 'job', {}, requestOptions)
    },
    /** Explicit cancellation is separate from abandoning a request listener. */
    cancelJob(jobId: string): boolean {
      return transport.available() && transport.send('histoire:ui:marketplace-job-cancel', { jobId })
    },
    /** Continue a reviewed job paused before its config write. */
    continueJob(jobId: string): boolean {
      return transport.available() && transport.send('histoire:ui:marketplace-job-continue', { jobId })
    },
    /** Observe live job snapshots; correlate private errors through request promises. */
    subscribeJob(callback: (job: JobState) => void): () => void {
      if (!transport.available()) return () => {}
      return transport.on('histoire:ui:marketplace-job-state', (event: MarketplaceJobEvent) => {
        if ('job' in event && event.job) callback(event.job)
      })
    },
    /** Read compatible updates from the server's installed inventory. */
    updates(prefs: MarketplacePrefs, requestOptions?: MarketplaceRequestOptions): Promise<MarketplaceUpdate[]> {
      return request('histoire:ui:marketplace-updates', 'histoire:ui:marketplace-updates-result', 'updates', { prefs }, requestOptions)
    },
  }
}

/** Shared workbench client; no I/O occurs until a consumer calls a wrapper. */
export const marketplaceClient = createMarketplaceClient()
