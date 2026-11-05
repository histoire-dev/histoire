import type { ChangePlan, ChangeRequest, JobState, MarketplaceUpdate } from '@histoire/shared'
import type { MarketplaceServiceOwner } from '../../../marketplace/shell/marketplace-services.js'
import { computed, ref, shallowRef, watch } from 'vue'
import { jobProgressLabel } from '../../../marketplace/shell/job-progress-label.js'

/** Keep sequential settings work alive independently of mounted surfaces. */
export function createSettingsJobs(store: MarketplaceServiceOwner, dev: boolean) {
  const preparing = ref<string>()
  const active = shallowRef<JobState>()
  const error = ref('')
  const manager = shallowRef<ChangePlan['packageManager']>()
  const queue = ref<MarketplaceUpdate[]>([])
  const handled = new Set<string>()
  const storageKey = `_histoire-settings-job:${import.meta.env.BASE_URL}`
  let controller: AbortController | undefined
  let disposed = false
  const busy = computed(() => Boolean(preparing.value || active.value?.status === 'running' || store.job.value?.status === 'running'))
  const step = computed(() => jobProgressLabel(active.value))
  const request = computed(() => store.reviewedJob.value?.request)
  const recoveredId = request.value && ['pin', 'remove', 'update'].includes(request.value.kind) ? store.reviewedJob.value?.jobId : undefined
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
    if (recoveredId && Array.isArray(saved)) queue.value = saved.filter(item => typeof item?.id === 'string' && typeof item?.to === 'string' && item.breaking === false)
  }
  catch { /* Blocked or malformed storage never prevents management. */ }
  /** Queue is the only settings-owned receipt; reviewed intent belongs to the store. */
  function persist(): void {
    try {
      if (queue.value.length) sessionStorage.setItem(storageKey, JSON.stringify(queue.value))
      else sessionStorage.removeItem(storageKey)
    }
    catch { /* Live queue remains usable when storage is blocked. */ }
  }
  const stopQueue = watch(queue, persist, { deep: true, flush: 'sync', immediate: true })
  /** Route errors through the wizard's existing failure surface and retained receipt. */
  function showFailure(change = request.value): void {
    queue.value = []
    if (change) store.startInstall(change)
  }
  /** Plan before starting; read-only results reuse the shared manual flow. */
  async function run(change: ChangeRequest): Promise<void> {
    if (disposed || busy.value) return
    const request = { ...change, prefs: JSON.parse(JSON.stringify(change.prefs)) }
    preparing.value = change.id
    error.value = ''
    const current = controller = new AbortController()
    try {
      const plan = await store.client.plan(request, { signal: current.signal })
      if (current.signal.aborted) return
      manager.value = plan.packageManager
      if (plan.manual) {
        queue.value = []
        store.startInstall(request, plan)
        return
      }
      const job = await store.startJob(plan.planId, plan.hash, request)
      if (!current.signal.aborted) {
        active.value = job
        await observe(job)
      }
    }
    catch (cause) {
      if (!current.signal.aborted) {
        error.value = cause instanceof Error ? cause.message : 'Plugin change failed'
        showFailure(request)
      }
    }
    finally { if (controller === current) preparing.value = undefined }
  }
  /** Expose the running receipt immediately, then advance after confirmed load. */
  async function observe(job: JobState | undefined): Promise<void> {
    if (disposed || !job) return
    if (job.jobId !== active.value?.jobId && job.jobId !== recoveredId) {
      // A queue is valid only for the reviewed receipt recovered by this owner.
      if (!active.value && !preparing.value) queue.value = []
      return
    }
    active.value = job
    if (handled.has(job.jobId)) return
    if (job.status !== 'running') handled.add(job.jobId)
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
  const stop = dev
    ? watch(store.job, (job) => {
        void observe(job)
      }, { immediate: true })
    : undefined
  /** Retire browser work while preserving restart recovery and server ownership. */
  function dispose(): void {
    disposed = true
    stop?.()
    stopQueue()
    controller?.abort()
    preparing.value = undefined
  }
  return { active, preparing, busy, step, error: computed(() => error.value || (active.value?.jobId === store.job.value?.jobId ? store.restartError.value : '')), manager, run, updateAll, restart, dispose }
}
