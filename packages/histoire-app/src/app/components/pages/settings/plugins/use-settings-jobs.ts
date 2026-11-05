import type { ChangePlan, ChangeRequest, JobState, MarketplaceUpdate } from '@histoire/shared'
import type { MarketplaceStore } from '../../../../stores/marketplace.js'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

/** Settings jobs remain owned while their section is closed and rail stays mounted. */
const sessions = new WeakMap<MarketplaceStore, ReturnType<typeof createJobs>>()
/** Labels shared by inline progress, including receipt recovery. */
const labels = { resolve: 'Resolving plugin', install: 'Installing package', config: 'Updating histoire.config.ts', restart: 'Restarting dev server', load: 'Loading plugin' }

/** Create a sequential queue that advances on terminal success, never admission. */
function createJobs(store: MarketplaceStore) {
  const preparing = ref<string>()
  const active = shallowRef<JobState>()
  const error = ref('')
  const manager = shallowRef<ChangePlan['packageManager']>()
  const queue = ref<MarketplaceUpdate[]>([])
  const handled = new Set<string>()
  const storageKey = `_histoire-settings-job:${import.meta.env.BASE_URL}`
  let recoveredId: string | undefined
  let request: ChangeRequest | undefined
  let controller: AbortController | undefined
  let consumers = 0
  let stop: (() => void) | undefined
  const busy = computed(() => Boolean(preparing.value || active.value?.status === 'running' || store.job.value?.status === 'running'))
  const step = computed(() => active.value?.awaiting === 'restart' ? 'Restart the dev server to finish' : active.value?.awaiting ? 'Restart required' : labels[active.value?.steps.find(item => item.state === 'running')?.id ?? 'resolve'])

  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
    if (typeof saved?.jobId === 'string' && typeof saved?.request?.id === 'string' && ['pin', 'remove', 'update'].includes(saved.request.kind)) {
      recoveredId = saved.jobId
      request = saved.request
      if (Array.isArray(saved.queue)) queue.value = saved.queue.filter(item => typeof item.id === 'string' && typeof item.to === 'string' && item.breaking === false)
    }
  }
  catch { /* Blocked or malformed session storage never prevents plugin management. */ }

  /** Route errors through the wizard's existing failure surface and retained receipt. */
  function showFailure(): void {
    queue.value = []
    if (request) store.startInstall(request)
  }
  /** Plan before starting; read-only results reuse the shared manual flow. */
  async function run(change: ChangeRequest): Promise<void> {
    if (busy.value) return
    request = { ...change, prefs: JSON.parse(JSON.stringify(change.prefs)) }
    preparing.value = change.id
    error.value = ''
    const current = controller = new AbortController()
    try {
      const plan = await store.client.plan(request, { signal: current.signal })
      if (current.signal.aborted) return
      manager.value = plan.packageManager
      if (plan.manual) {
        queue.value = []
        store.startInstall(request)
        store.showManual(plan)
        return
      }
      const job = await store.startJob(plan.planId, plan.hash, request)
      if (!current.signal.aborted) {
        active.value = job
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ jobId: job.jobId, request, queue: queue.value }))
        }
        catch { /* Live progress still works without restart recovery storage. */ }
        store.job.value = job
        await observe(job)
      }
    }
    catch (cause) {
      if (!current.signal.aborted) {
        error.value = cause instanceof Error ? cause.message : 'Plugin change failed'
        showFailure()
      }
    }
    finally { if (controller === current) preparing.value = undefined }
  }
  /** Expose the running receipt immediately, then advance after confirmed load. */
  async function observe(job: JobState | undefined): Promise<void> {
    if (!job || (job.jobId !== active.value?.jobId && job.jobId !== recoveredId)) return
    active.value = job
    if (handled.has(job.jobId)) return
    if (job.status !== 'running') {
      handled.add(job.jobId)
      try {
        sessionStorage.removeItem(storageKey)
      }
      catch { /* Optional recovery storage may be unavailable. */ }
    }
    if (job.status === 'failed') {
      error.value = job.failure?.message ?? 'Plugin change failed'
      showFailure()
    }
    else if (job.status === 'cancelled') {
      queue.value = []
    }
    else if (job.status === 'succeeded') {
      const next = queue.value.shift()
      if (next) {
        // Admission resolves before terminal state. Drop preparation before next plan.
        preparing.value = undefined
        await run({ kind: 'update', id: next.id, version: next.to, prefs: store.prefs.value })
      }
    }
  }
  /** Explicit row action delegates to workbench-owned restart/continuation policy. */
  async function restart(): Promise<void> {
    await store.restartJob(active.value)
  }
  /** Breaking updates always enter the review dialog; safe updates remain ordered. */
  async function updateAll(updates: MarketplaceUpdate[]): Promise<void> {
    if (busy.value) return
    const breaking = updates.find(item => item.breaking)
    if (breaking) store.openUpdate(breaking.id)
    queue.value = updates.filter(item => !item.breaking)
    const first = queue.value.shift()
    if (first) await run({ kind: 'update', id: first.id, version: first.to, prefs: store.prefs.value })
  }
  /** Only mounted owners observe progress; leaving settings never cancels server work. */
  function acquire(): void {
    if (consumers++ === 0) {
      stop = watch(store.job, (job) => {
        void observe(job)
      }, { immediate: true })
    }
  }
  /** Retire browser requests and queued work when the owning workbench unmounts. */
  function release(): void {
    if (--consumers > 0) return
    stop?.()
    controller?.abort()
    queue.value = []
    preparing.value = undefined
  }
  return { active, preparing, busy, step, error: computed(() => error.value || (active.value?.jobId === store.job.value?.jobId ? store.restartError.value : '')), manager, run, updateAll, restart, acquire, release }
}

/** Share job progress between settings and the workbench rail. */
export function useSettingsJobs(store: MarketplaceStore, dev = __HISTOIRE_DEV__) {
  let state = sessions.get(store)
  if (!state) sessions.set(store, state = createJobs(store))
  if (dev) {
    onMounted(state.acquire)
    onUnmounted(state.release)
  }
  return state
}
