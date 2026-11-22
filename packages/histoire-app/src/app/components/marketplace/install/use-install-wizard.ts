import type { HistoireJsonValue } from '@histoire/protocol'
import type { ChangePlan, ChangeRequest, JobState, PluginDetail } from '@histoire/shared'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import { manualInstructions } from './manual-instructions.js'
import { useInstallPlan } from './use-install-plan.js'

/** One visible wizard visit owns reads; project jobs remain owned by the server. */
export function useInstallWizard() {
  const store = useMarketplaceStore()
  const detail = shallowRef<PluginDetail>()
  const values = ref<Record<string, HistoireJsonValue>>({})
  const intent = shallowRef<ChangeRequest>()
  const step = ref(0)
  const error = ref<string>()
  const notice = ref<string>()
  const starting = ref(false)
  const restarting = store.restarting
  const openAfter = ref(false)
  const manual = shallowRef<ChangePlan>()
  const forcedManual = ref(false)
  const activeJob = shallowRef<JobState>()
  const fields = computed(() => (detail.value?.manifest.config.options ?? []).filter(field => Object.entries(field.when ?? {}).every(([key, value]) => JSON.stringify(values.value[key]) === JSON.stringify(value))))
  const request = computed(() => {
    if (!intent.value || !detail.value) return undefined
    // Hidden options are omitted, so disabled dependent values cannot leak into config.
    const options = Object.fromEntries(fields.value.filter(field => values.value[field.key] !== undefined).map(field => [field.key, values.value[field.key]]))
    // JSON values cross the transport boundary without Vue proxies (notably string lists).
    return { ...intent.value, options: JSON.parse(JSON.stringify(options)) as Record<string, HistoireJsonValue> }
  })

  const { plan, loading, error: planError, replan } = useInstallPlan(request)
  let disposed = false
  let detailController: AbortController | undefined
  let jobController: AbortController | undefined
  let manualRevision = 0
  let ignoredJob: string | undefined
  const offClose = store.onClose(() => {
    manualRevision++
    detailController?.abort()
    jobController?.abort()
  })

  /** Load declarative fields for the current install request, retaining defaults as literals. */
  async function load(): Promise<void> {
    detailController?.abort()
    const change = store.installRequest.value
    if (!change) return
    const current = detailController = new AbortController()
    detail.value = undefined
    error.value = undefined
    try {
      const options = { signal: current.signal, version: change.version }
      let result = await store.client.detail(change.id, change.prefs, options)
      if (!change.version && change.kind === 'install' && result.installVersion) {
        result = await store.client.detail(change.id, change.prefs, { ...options, version: result.installVersion })
      }
      if (current.signal.aborted) return
      values.value = Object.fromEntries((result.manifest.config.options ?? []).filter(field => field.default !== undefined).map(field => [field.key, structuredClone(field.default!)]))
      Object.assign(values.value, change.options)
      const version = change.version ?? (change.kind === 'install' ? result.latest : undefined)
      intent.value = { ...change, ...(version ? { version } : {}), prefs: { ...change.prefs } }
      detail.value = result
    }
    catch (cause) {
      if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Could not load options'
    }
  }
  watch(store.installRequest, load, { immediate: true })

  /** Build manual commands through existing static planner, preserving reviewed manager command. */
  async function showManual(source = plan.value): Promise<void> {
    if (!source || !request.value || !detail.value) return
    const revision = ++manualRevision
    try {
      const result = await manualInstructions(request.value, detail.value, source)
      if (!disposed && revision === manualRevision) manual.value = result
    }
    catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : 'Could not load manual steps'
    }
  }
  watch(request, () => {
    manualRevision++
    if (!store.manualPlan.value) manual.value = undefined
  }, { flush: 'sync' })
  watch(plan, (value) => {
    if (value?.manual) void showManual(value)
  })
  watch(store.manualPlan, (value) => {
    if (value) manual.value = value
  }, { immediate: true })

  /** Explicit restart follows amended protocol; no browser code writes project files. */
  async function restart(): Promise<void> {
    await store.restartJob(activeJob.value)
  }
  watch(store.job, (job) => {
    if (!job || job.jobId === ignoredJob) return
    const change = store.installRequest.value
    const matches = job.id === change?.id && job.kind === change.kind && (!change.version || job.version === change.version)
    // A retained terminal receipt must not replace a new version's install form.
    if (matches || (job.status === 'running' && job.id === change?.id) || job.jobId === activeJob.value?.jobId) activeJob.value = job
  }, { immediate: true })

  /** Admit only a settled, reviewed plan; recover stale hashes and another owner's busy job. */
  async function install(): Promise<void> {
    if (!plan.value || loading.value || starting.value || plan.value.manual) return
    const reviewed = plan.value
    const current = jobController = new AbortController()
    starting.value = true
    error.value = undefined
    try {
      const job = await store.startJob(reviewed.planId, reviewed.hash, request.value!, openAfter.value ? detail.value?.adds.find(add => add.kind === 'rail-pane')?.contribution : undefined)
      if (!current.signal.aborted) activeJob.value = job
    }
    catch (cause) {
      if (current.signal.aborted) return
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined
      if (code === 'stale') {
        step.value = 1
        notice.value = 'Review updated changes'
        await replan()
      }
      else if (code === 'busy') {
        const job = await store.client.currentJob({ signal: current.signal }).catch((failure) => {
          if (!current.signal.aborted) error.value = failure instanceof Error ? failure.message : 'Could not load running job'
          return null
        })
        if (!current.signal.aborted && job) activeJob.value = job
      }
      else {
        error.value = cause instanceof Error ? cause.message : 'Could not start install'
      }
    }
    finally { if (!disposed) starting.value = false }
  }
  /** Failures always get a fresh plan and review; alternatives never start automatically. */
  async function retry(version?: string): Promise<void> {
    ignoredJob = activeJob.value?.jobId
    activeJob.value = undefined
    manual.value = undefined
    forcedManual.value = false
    step.value = 1
    error.value = undefined
    if (version && intent.value) intent.value = { ...intent.value, version }
    await replan()
  }
  /** Keep the policy in the request so a checkbox edit cannot reuse its old hash. */
  function setRestart(value: boolean): void {
    if (intent.value) intent.value = { ...intent.value, prefs: { ...intent.value.prefs, afterInstall: value ? 'restart' : 'ask' } }
  }
  /** Manual fallback does not admit a job. */
  function copyCommands(): void {
    forcedManual.value = true
    void showManual()
  }
  onScopeDispose(() => {
    offClose()
    disposed = true
    manualRevision++
    detailController?.abort()
    jobController?.abort()
  })
  return { store, detail, values, fields, intent, plan, loading, step, error: computed(() => error.value ?? store.restartError.value), planError, notice, starting, restarting, openAfter, manual, forcedManual, activeJob, load, replan, install, retry, restart, setRestart, copyCommands }
}
