import type { CatalogPage, CatalogQuery, ChangePlan, ChangeRequest, JobState, PluginId } from '@histoire/shared'
import type { InjectionKey } from 'vue'
import type { createUiSettingsStore } from './settings.js'
import { inject, markRaw, nextTick, provide, ref, shallowRef, toRef, watch } from 'vue'
import { createDebouncedCatalogClient } from '../components/marketplace/browse/catalog-client.js'
import { createCatalogCollections } from '../components/marketplace/browse/catalog-collections.js'
import { createMarketplaceJobs } from '../components/marketplace/shell/marketplace-jobs.js'
import { createMarketplaceReads } from '../components/marketplace/shell/marketplace-reads.js'
import { createPluginUpdates } from '../components/pages/settings/plugins/use-plugin-updates.js'
import { createSettingsJobs } from '../components/pages/settings/plugins/use-settings-jobs.js'
import { marketplaceClient } from '../util/marketplace-client.js'

/** Views remain local to the modal; no route is changed. */
export type MarketplaceView = 'discover' | 'all' | 'detail' | 'install'
/** Detail tab intent persists through metadata loading and nested navigation. */
export type MarketplaceDetailTab = 'overview' | 'options' | 'changelog' | 'versions'
/** Dependencies are owned by the nearest standalone workbench. */
export interface MarketplaceStoreOptions {
  /** Existing local UI settings owner. */ settings: ReturnType<typeof createUiSettingsStore>
  /** Runtime supports project mutations and update checks. */ dev?: boolean
  /** Real client, with an injectable external channel for tests. */ client?: typeof marketplaceClient
}
/** Breadcrumb entries retain the exact parent action and package. */
interface Visit {
  /** Active screen. */ view: MarketplaceView
  /** Selected package. */ selectedId?: PluginId
  /** Selected detail tab. */ detailTab: MarketplaceDetailTab
  /** Parent install action. */ installRequest?: ChangeRequest
  /** Parent manual instructions. */ manualPlan?: ChangePlan
}

/** Create one modal, preference and job owner without global reactive state. */
export function createMarketplaceStore(options: MarketplaceStoreOptions) {
  const client = createDebouncedCatalogClient(options.client ?? marketplaceClient)
  /** Whether the native modal is visible. */
  const open = ref(false)
  /** Active local screen. */
  const view = ref<MarketplaceView>('discover')
  /** Search retained across sections and nested flows. */
  const query = ref('')
  /** Current catalog facets. */
  const filters = ref<NonNullable<CatalogQuery['filters']>>({})
  /** Catalog ordering. */
  const sort = ref<NonNullable<CatalogQuery['sort']>>('relevance')
  /** Package shown by detail or install. */
  const selectedId = ref<PluginId>()
  /** Requested detail tab, independent of asynchronous metadata reads. */
  const detailTab = ref<MarketplaceDetailTab>('overview')
  /** Requested wizard action, including options. */
  const installRequest = shallowRef<ChangeRequest>()
  /** Copyable instructions for read-only projects. */
  const manualPlan = shallowRef<ChangePlan>()
  /** Latest server-owned job, retained while the modal is closed. */
  const job = shallowRef<JobState>()
  /** Browser-local preferences shared with settings. */
  const prefs = toRef(options.settings.state, 'marketplace')
  /** Connected element receiving focus after dismissal. */
  const opener = shallowRef<HTMLElement>()
  /** Independent update-dialog package selection. */
  const updateTarget = ref<PluginId>()
  /** Latest successful catalog response, preserved during refresh failures. */
  const page = shallowRef<CatalogPage>()
  /** Section the current page was requested for; views ignore the other section's page while theirs loads. */
  const pageView = shallowRef<'discover' | 'all'>()
  /** Whether the latest catalog request is pending. */
  const loading = ref(false)
  /** Latest catalog failure; browse renders the shared error state. */
  const error = ref<string>()
  /** Parent screens used by breadcrumb navigation. */
  const history = ref<Visit[]>([])
  const jobs = createMarketplaceJobs(client, job, startInstall)
  let connected = false
  let disposed = false
  let offJob: (() => void) | undefined
  let currentController: AbortController | undefined
  let catalogController: AbortController | undefined
  const reads = createMarketplaceReads()
  const collections = createCatalogCollections(page, () => prefs.value.community)
  const serviceOwner = { client, prefs, job, reviewedJob: jobs.reviewedJob, restartError: jobs.restartError, startJob: jobs.startJob, restartJob: jobs.restartJob, startInstall, openUpdate }
  const updates = createPluginUpdates(serviceOwner, options.dev ?? __HISTOIRE_DEV__)
  const settingsJobs = createSettingsJobs(serviceOwner, options.dev ?? __HISTOIRE_DEV__)

  /** Latest query owns publication; closing or changing filters aborts stale reads. */
  async function loadCatalog(): Promise<void> {
    catalogController?.abort()
    if (!open.value || disposed) return
    const controller = catalogController = new AbortController()
    loading.value = true
    error.value = undefined
    try {
      const section = view.value === 'discover' ? 'discover' : 'all'
      const result = await client.catalog({ view: section, query: query.value, filters: filters.value, sort: sort.value, prefs: prefs.value }, { signal: controller.signal })
      if (!controller.signal.aborted) {
        page.value = result
        pageView.value = section
      }
    }
    catch (cause) {
      if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Could not load plugins'
    }
    finally { if (catalogController === controller) loading.value = false }
  }
  const stopCatalog = watch([open, query, filters, sort, () => prefs.value.community, () => view.value === 'discover'], () => {
    void loadCatalog()
  }, { deep: true })

  /** Start the shared subscription once and recover server-owned work on mount. */
  function connect(): void {
    if (connected || disposed) return
    connected = true
    offJob = client.subscribeJob((value) => {
      if (!disposed) jobs.receiveJob(value)
    })
    currentController = new AbortController()
    // Correlated snapshots also reach subscribeJob; publish through one path.
    void client.currentJob({ signal: currentController.signal }).catch(() => {
      /* Static books and servers without jobs keep the shell usable. */
    })
    updates.connect()
  }
  /** Switch top-level sections while keeping search and facets. */
  function setView(value: 'discover' | 'all'): void {
    view.value = value
    history.value = []
    selectedId.value = undefined
    installRequest.value = undefined
    manualPlan.value = undefined
  }
  /** Open from settings or another workbench action, retaining its focus target. */
  function openMarketplace(value: 'discover' | 'all' = 'discover', target?: HTMLElement): void {
    if (!open.value) {
      const active = target ?? (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
      opener.value = active ? markRaw(active) : undefined
      void updates.refresh()
    }
    setView(value)
    open.value = true
  }
  /** Dismiss UI only; server-owned jobs continue until explicit cancellation. */
  function close(): void {
    open.value = false
    reads.abortReads()
    catalogController?.abort()
    loading.value = false
    const target = opener.value
    void nextTick(() => {
      if (!open.value && target?.isConnected) target.focus()
    })
  }
  /** Save the parent screen before entering a nested flow. */
  function visit(value: MarketplaceView): void {
    if (!open.value) openMarketplace()
    history.value.push({ view: view.value, selectedId: selectedId.value, detailTab: detailTab.value, installRequest: installRequest.value, manualPlan: manualPlan.value })
    view.value = value
  }
  /** Show declarative plugin metadata. */
  function showPlugin(id: PluginId, tab: MarketplaceDetailTab = 'overview'): void {
    visit('detail')
    detailTab.value = tab
    selectedId.value = id
    installRequest.value = tab === 'options' ? { kind: 'options', id, prefs: prefs.value } : undefined
  }
  /** Enter the install wizard with the selected action. */
  function startInstall(request: ChangeRequest, plan?: ChangePlan): void {
    visit('install')
    selectedId.value = request.id
    installRequest.value = request
    manualPlan.value = plan
  }
  /** Restore the immediate parent flow rather than guessing a route. */
  function back(): void {
    const parent = history.value.pop()
    if (!parent) {
      setView('all')
      return
    }
    view.value = parent.view
    selectedId.value = parent.selectedId
    detailTab.value = parent.detailTab
    installRequest.value = parent.installRequest
    manualPlan.value = parent.manualPlan
  }
  /** Select an update without navigating away from settings. */
  function openUpdate(id: PluginId): void {
    updateTarget.value = id
  }
  /** Typing a query leaves Discover and exposes matching plugins. */
  function setQuery(value: string): void {
    query.value = value
    if (view.value === 'discover' && value) setView('all')
  }
  /** Replace the facet selection without sharing mutable caller state. */
  function setFilters(value: NonNullable<CatalogQuery['filters']>): void {
    filters.value = JSON.parse(JSON.stringify(value))
  }
  /** Release only this workbench's listeners and requests; never cancel its job. */
  function dispose(): void {
    disposed = true
    reads.abortReads()
    updates.dispose()
    settingsJobs.dispose()
    collections.dispose()
    jobs.disposeJobs()
    offJob?.()
    currentController?.abort()
    catalogController?.abort()
    client.disposeCatalog()
    stopCatalog()
  }
  return { updates, settingsJobs, collections: collections.collections, onClose: reads.onClose, reviewedJob: jobs.reviewedJob, postInstall: jobs.postInstall, restarting: jobs.restarting, restartError: jobs.restartError, startJob: jobs.startJob, restartJob: jobs.restartJob, acknowledgePostInstall: jobs.acknowledgePostInstall, open, view, query, filters, sort, selectedId, detailTab, installRequest, manualPlan, job, prefs, opener, updateTarget, history, page, pageView, loading, error, client, connect, setView, openMarketplace, close, showPlugin, startInstall, back, openUpdate, setQuery, setFilters, loadCatalog, dispose }
}
/** Public store shape shared by later marketplace slices. */
export type MarketplaceStore = ReturnType<typeof createMarketplaceStore>
/** Nearest workbench owns every marketplace surface. */
const marketplaceKey: InjectionKey<MarketplaceStore> = Symbol('histoire-marketplace')
/** Install once beneath the standalone Histoire provider. */
export function provideMarketplaceStore(store: MarketplaceStore): void {
  provide(marketplaceKey, store)
}
/** Owning workbench store, or `undefined` in embedded shells that omit the marketplace. */
export function useOptionalMarketplaceStore(): MarketplaceStore | undefined {
  return inject(marketplaceKey, undefined)
}
/** Resolve the owning workbench without a global fallback. */
export function useMarketplaceStore(): MarketplaceStore {
  const store = inject(marketplaceKey)
  if (!store) throw new Error('Marketplace requires a workbench provider')
  return store
}
