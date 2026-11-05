import type { ChangeRequest, JobState } from '@histoire/shared'
import type { ShallowRef } from 'vue'
import type { marketplaceClient, MarketplaceRequestOptions } from '../../../util/marketplace-client.js'
import { computed, ref, shallowRef } from 'vue'

/** Destination retained until spotlight acknowledges this job. */
export interface PostInstall {
  /** Server receipt identity. */ jobId: string
  /** npm package identity, resolved through installed inventory by spotlight. */ pluginId: string
  /** Selected manifest rail-pane contribution id; actual registrations remain authoritative. */ openPane?: string
}
/** Reviewed intent survives the dev server restart that loads the plugin. */
export interface ReviewedJob {
  /** Server receipt identity. */ jobId: string
  /** Exact reviewed request, including its restart policy. */ request: ChangeRequest
  /** Selected manifest rail-pane contribution id. */ openPane?: string
}

/** Workbench lifetime owns restart observation; modal visits own only their reads. */
export function createMarketplaceJobs(client: typeof marketplaceClient, job: ShallowRef<JobState | undefined>, resume: (request: ChangeRequest) => void) {
  const key = `_histoire-marketplace-job:${import.meta.env.BASE_URL}`
  const reviewed = shallowRef<ReviewedJob>()
  const admissions = new Set<AbortController>()
  const restarting = ref(false)
  const restartError = ref<string>()
  let disposed = false
  let recovered = false
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (typeof saved?.jobId === 'string' && typeof saved.request?.id === 'string'
      && ['install', 'update', 'pin', 'remove', 'options'].includes(saved.request.kind)
      && ['restart', 'ask'].includes(saved.request.prefs?.afterInstall)) {
      reviewed.value = { jobId: saved.jobId, request: saved.request, openPane: typeof saved.openPane === 'string' ? saved.openPane : undefined }
      recovered = true
    }
  }
  catch { /* Blocked or invalid storage never prevents live job management. */ }
  const postInstall = computed<PostInstall | undefined>(() => {
    const value = reviewed.value
    return value ? { jobId: value.jobId, pluginId: value.request.id, ...(value.openPane ? { openPane: value.openPane } : {}) } : undefined
  })

  /** Save on admission: the server-requested restart can tear down this document. */
  function persist(): void {
    try {
      if (reviewed.value) sessionStorage.setItem(key, JSON.stringify(reviewed.value))
      else sessionStorage.removeItem(key)
    }
    catch { /* Current owner retains intent even when storage is unavailable. */ }
  }
  /** Spotlight acknowledges only its receipt, never a newer job's destination. */
  function acknowledgePostInstall(jobId: string): void {
    if (reviewed.value?.jobId !== jobId) return
    reviewed.value = undefined
    persist()
  }
  /** Recover navigation only from the same server receipt, never a stale local intent. */
  function receiveJob(value: JobState): void {
    if (disposed) return
    if (recovered) {
      recovered = false
      const saved = reviewed.value
      if (saved?.jobId === value.jobId && saved.request.id === value.id && saved.request.kind === value.kind) resume(saved.request)
      else if (saved) acknowledgePostInstall(saved.jobId)
    }
    job.value = value
  }
  /** Atomically attach reviewed policy/destination to successful admission. */
  async function startJob(planId: string, hash: string, request: ChangeRequest, openPane?: string, options?: Omit<MarketplaceRequestOptions, 'signal'>): Promise<JobState> {
    restartError.value = undefined
    // Once sent, admission belongs to the workbench. Dismissing its wizard cannot
    // discard reviewed intent while the server is still accepting that request.
    const controller = new AbortController()
    admissions.add(controller)
    const snapshot: ChangeRequest = JSON.parse(JSON.stringify(request))
    try {
      const value = await client.startJob(planId, hash, { ...options, signal: controller.signal })
      if (!disposed) {
        reviewed.value = { jobId: value.jobId, request: snapshot, ...(openPane ? { openPane } : {}) }
        persist()
        job.value = value
      }
      return value
    }
    finally {
      admissions.delete(controller)
    }
  }
  /**
   * Resumes a job held by ask mode; the server then asks the dev proxy to replace the
   * dev server process. A manual `restart` wait has nothing to resume from the browser.
   */
  async function restartJob(value = job.value): Promise<boolean> {
    if (disposed || value?.awaiting !== 'continue' || value.status !== 'running' || restarting.value) return false
    restarting.value = true
    restartError.value = undefined
    let accepted = false
    try {
      accepted = client.continueJob(value.jobId)
    }
    catch { /* Rejected transport remains actionable through Restart now. */ }
    if (!disposed) {
      if (!accepted && job.value?.jobId === value.jobId) restartError.value = 'Could not restart dev server. Try Restart now again.'
      restarting.value = false
    }
    return accepted
  }

  /** Stop observers without cancelling server work or deleting its recovery receipt. */
  function disposeJobs(): void {
    disposed = true
    for (const controller of admissions) controller.abort()
  }
  return { reviewedJob: reviewed, postInstall, restarting, restartError, startJob, restartJob, receiveJob, acknowledgePostInstall, disposeJobs }
}
