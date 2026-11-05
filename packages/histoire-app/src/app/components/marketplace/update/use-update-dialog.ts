import type { ChangeRequest, JobState, PluginDetail } from '@histoire/shared'
import type { MarketplaceTransport } from '../../../util/marketplace-client.js'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import { createMarketplaceClient } from '../../../util/marketplace-client.js'
import { useInstallPlan } from '../install/use-install-plan.js'

/** Dialog reads belong to its visit; admitted jobs and restart policy belong to the store. */
export function useUpdateDialog(transport?: MarketplaceTransport) {
  const store = useMarketplaceStore()
  const client = createMarketplaceClient({ transport })
  const detail = shallowRef<PluginDetail>()
  const apply = ref(true)
  const loading = ref(false)
  const error = ref<string>()
  const starting = ref(false)
  const active = shallowRef<JobState>()
  let controller: AbortController | undefined
  let admitted: ChangeRequest | undefined
  let disposed = false
  let revision = 0
  const hasMigrations = computed(() => Boolean(detail.value?.manifest.migrations?.length))
  const request = computed<ChangeRequest | undefined>(() => detail.value && store.updateTarget.value && !active.value
    ? {
        kind: 'update',
        id: detail.value.id,
        version: detail.value.installed?.update ?? detail.value.latest,
        migrate: hasMigrations.value && apply.value,
        prefs: JSON.parse(JSON.stringify(store.prefs.value)),
      }
    : undefined)
  const review = useInstallPlan(request)
  const busy = computed(() => starting.value || active.value?.status === 'running')
  const progress = computed(() => {
    const job = active.value
    if (job?.awaiting === 'restart') return 'Restart the dev server to finish'
    if (job?.awaiting) return 'Restart required'
    if (job?.status === 'cancelled') return 'Update cancelled'
    const step = job?.steps.find(step => step.state === 'running')?.id ?? 'resolve'
    return {
      /** Resolve package metadata. */ resolve: 'Resolving plugin',
      /** Package-manager execution. */ install: 'Installing package',
      /** Guarded config write. */ config: 'Updating histoire.config.ts',
      /** Dev proxy replaces the server process. */ restart: 'Restarting dev server',
      /** Successor confirms installed plugin. */ load: 'Loading plugin',
    }[step]
  })

  /** Retire metadata and review authority synchronously before another visit can start. */
  async function load(): Promise<void> {
    const currentRevision = ++revision
    controller?.abort()
    detail.value = undefined
    active.value = undefined
    admitted = undefined
    error.value = undefined
    starting.value = false
    const id = store.updateTarget.value
    loading.value = Boolean(id)
    if (!id) return
    const current = controller = new AbortController()
    try {
      const value = await client.updateDetail(id, store.prefs.value, { signal: current.signal })
      if (current.signal.aborted || revision !== currentRevision) return
      apply.value = true
      detail.value = value
    }
    catch (cause) {
      if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Could not load update'
    }
    finally { if (revision === currentRevision) loading.value = false }
  }
  watch([store.updateTarget, () => store.prefs.value.community], () => {
    void load()
  }, { immediate: true, flush: 'sync' })

  /** Close only this dialog; never cancel an admitted server job. */
  function dismiss(): void {
    store.updateTarget.value = undefined
  }
  /** Terminal failure reuses the install wizard's retained receipt and recovery surface. */
  function observe(job: JobState): void {
    active.value = job
    if (job.status === 'failed' && admitted) {
      const request = admitted
      dismiss()
      store.startInstall(request)
    }
    else if (job.status === 'succeeded' && job.steps.some(step => step.id === 'load' && step.state === 'done')) {
      dismiss()
    }
  }
  watch(store.job, (job) => {
    if (job && job.jobId === active.value?.jobId) observe(job)
  })
  /** Persist target dismissal through existing settings storage and shared update cache. */
  function skip(): void {
    if (!request.value || busy.value) return
    store.prefs.value.skippedVersions[request.value.id] = request.value.version!
    dismiss()
  }
  /** Admit only the current reviewed capability; late admission cannot close a newer visit. */
  async function update(): Promise<void> {
    const plan = review.plan.value
    const change = request.value
    if (!plan || !change || busy.value || store.job.value?.status === 'running') return
    if (plan.manual) {
      dismiss()
      store.startInstall(change)
      store.showManual(plan)
      return
    }
    const current = revision
    admitted = JSON.parse(JSON.stringify(change))
    starting.value = true
    error.value = undefined
    try {
      const job = await store.startJob(plan.planId, plan.hash, admitted!)
      if (!disposed && revision === current) observe(job)
    }
    catch (cause) {
      if (disposed || revision !== current) return
      error.value = cause instanceof Error ? cause.message : 'Could not start update'
      await review.replan()
    }
    finally { if (revision === current) starting.value = false }
  }
  onScopeDispose(() => {
    disposed = true
    revision++
    controller?.abort()
  })
  return { store, detail, apply, hasMigrations, loading, error, starting, active, busy, progress, review, load, dismiss, skip, update }
}
