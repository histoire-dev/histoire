import type { HistoireSession } from '@histoire/sdk'
import type { HistoireVisualCase, HistoireVisualRunOptions, UiVisualCase, UiVisualReply, UiVisualResult, UiVisualRun } from '@histoire/shared'
import type { InjectionKey } from 'vue'
import { computed, inject, provide, ref, shallowRef, watch } from 'vue'
import { useCaptureDiscoveryPause } from '../components/panes/tests/capture.js'
import { createVisualApproval } from './visual-approval.js'
import { createVisualCollection } from './visual-collection.js'
import { createVisualRefresh, loadVisualInventory } from './visual-refresh.js'
import { createVisualTransport } from './visual-transport.js'
/** Provider-local visual state shares exact owned results across pane and viewer. */
export function createWorkbenchVisual(session: HistoireSession) {
  const cases = shallowRef<UiVisualCase[]>([])
  const profiles = shallowRef<{ id: string }[]>([])
  const baselineRef = ref('main')
  const mode = ref<'functional' | 'visual'>('functional')
  const profileId = ref('')
  const baselineSource = ref<'working' | 'main'>('working')
  const run = shallowRef<UiVisualRun>()
  const completed = ref(0)
  const requestId = ref<string | null>(null)
  const issue = ref('')
  const saving = ref(false)
  const inventoryLoading = ref(false)
  const selectedIds = ref<string[]>([])
  const selectedResultId = ref<string>()
  const viewerOpen = ref(false)
  let active = true
  let generation = 0
  let source = JSON.stringify(session.getSnapshot().source)
  let inventorySource = ''
  /** Current run skips valid evidence, so untouched rows may need revalidation afterwards. */
  let incremental = false
  const transport = createVisualTransport(progress, disconnect, reconnect)
  const collection = createVisualCollection(transport, () => ({ active, generation }), { profileId, baselineSource, baselineRef })
  const approval = createVisualApproval(transport, collection, () => ({ active, generation }), selectedIds, issue)
  const { approving, approve } = approval
  const results = collection.results
  const selectedResult = computed(() => results.value.find(result => result.id === selectedResultId.value))
  const stopFilters = watch([profileId, baselineSource, baselineRef], () => {
    selectedIds.value = []
    viewerOpen.value = false
  })
  useCaptureDiscoveryPause(requestId)
  /** A stale owner cannot publish into replacement runtime's pane or viewer. */
  function disconnect() {
    generation++
    inventorySource = ''
    requestId.value = null
    inventoryLoading.value = true
    saving.value = false
    approval.reset()
    if (run.value) {
      run.value = { ...run.value, stale: true }
    }
    collection.retire()
    issue.value = ''
  }
  /** Load all bounded result pages from server-retained evidence. */
  async function loadResults(id: string, token = generation) {
    const values: UiVisualResult[] = []
    let offset: number | undefined = 0
    let latest: UiVisualRun | undefined
    do {
      const reply = await transport.request({ action: 'results', runId: id, offset })
      if (!active || token !== generation) {
        return
      }
      if (!reply.run || reply.run.id !== id) {
        throw new Error('Visual run unavailable')
      }
      latest = reply.run
      values.push(...reply.run.results)
      offset = reply.nextOffset
    } while (offset !== undefined)
    run.value = { ...latest!, results: [] }
    collection.finish()
    collection.merge(values)
    if (incremental && collection.hasRetired()) {
      // Failed or skipped recovery left rows marked stale; server reused them, so revalidate now.
      const issues = await collection.recover()
      if (!active || token !== generation) return
      issue.value = issues.join('\n')
      // Live captures keep their session authority over recovered copies.
      collection.merge(values)
    }
    if (!selectedResultId.value || !results.value.some(result => result.id === selectedResultId.value)) {
      selectedResultId.value = values.find(result => result.status !== 'passed')?.id ?? values[0]?.id
    }
  }
  /** Only matching active capture replies can update counts or settle a run. */
  function progress(reply: UiVisualReply) {
    if (active && reply.run?.stale && reply.run.id === run.value?.id) {
      generation++
      run.value = { ...run.value!, stale: true }
      collection.retire()
      requestId.value = null
      inventoryLoading.value = saving.value = false
      approval.reset()
      return
    }
    if (!active || reply.requestId !== requestId.value) {
      return
    }
    if (reply.planned) collection.plan(reply.planned)
    if (reply.error) {
      issue.value = reply.error
      requestId.value = null
      collection.finish()
      return
    }
    if (!reply.run) {
      return
    }
    run.value = reply.run
    completed.value = reply.completed ?? 0
    if (reply.run.state !== 'running') {
      requestId.value = null
      const token = generation
      void loadResults(reply.run.id, token).catch((error) => {
        if (active && token === generation) {
          issue.value = error.message
          collection.finish()
        }
      })
    }
  }
  /** Initial/reconnected inventory includes saved cells and exact profile names. */
  const refresh = createVisualRefresh(async () => {
    const snapshot = session.getSnapshot()
    if (snapshot.status !== 'ready' || snapshot.stale) return
    const token = generation
    inventoryLoading.value = true
    issue.value = ''
    try {
      const inventory = await loadVisualInventory(transport, () => active && token === generation)
      if (!inventory) return
      cases.value = inventory.cases
      profiles.value = inventory.profiles
      baselineRef.value = inventory.baselineRef
      if (!requestId.value) {
        const issues = await collection.recover()
        if (active && token === generation) issue.value = issues.join('\n')
      }
    }
    catch (error) {
      if (active && token === generation) {
        issue.value = (error as Error).message
      }
    }
    finally {
      if (active && token === generation) {
        inventoryLoading.value = false
      }
    }
  }, () => generation)
  /** Reconnect waits for ready catalog before claiming evidence into fresh socket session. */
  function reconnect() {
    inventorySource = ''
    const snapshot = session.getSnapshot()
    if (snapshot.status === 'ready' && !snapshot.stale) void refresh()
  }
  /** Snapshot requested filters; live canvas settings cannot change capture profiles. */
  function start(options: Omit<HistoireVisualRunOptions, 'signal'> = {}) {
    if (requestId.value || saving.value || approving.value) {
      return
    }
    generation++
    inventoryLoading.value = false
    issue.value = ''
    selectedIds.value = []
    viewerOpen.value = false
    completed.value = 0
    mode.value = 'visual'
    incremental = !!options.incremental
    const selected = { ...(profileId.value ? { profileId: profileId.value } : {}), ...(baselineSource.value === 'main' ? { baselineRef: baselineRef.value } : {}), ...options }
    if (options.baselineRef) baselineSource.value = 'main'
    collection.begin(selected)
    requestId.value = transport.identity()
    try {
      transport.send({ action: 'run', options: selected }, requestId.value)
    }
    catch (error) {
      issue.value = (error as Error).message
      requestId.value = null
      collection.finish()
    }
  }
  /** Stop only browser's current run; service drains exact lane handle. */
  function cancel() {
    if (requestId.value) {
      transport.send({ action: 'cancel', runId: run.value?.id ?? requestId.value }, transport.identity())
    }
  }
  /** Persist saved cells in bounded individual requests, retaining per-cell errors. */
  async function save(inputs: Omit<HistoireVisualCase, 'id' | 'kind' | 'schemaVersion'>[]) {
    const token = generation
    saving.value = true
    issue.value = ''
    const saved: UiVisualCase[] = []
    const errors: string[] = []
    try {
      for (const item of inputs) {
        if (!active || token !== generation) {
          break
        }
        try {
          const reply = await transport.request({ action: 'save', case: item })
          if (!reply.case) {
            throw new Error('Saved visual case unavailable')
          }
          saved.push(reply.case)
        }
        catch (error) {
          errors.push(`${item.label}: ${(error as Error).message}`)
        }
      }
      if (active && token === generation) {
        await refresh()
        issue.value = errors.join('\n')
      }
    }
    finally {
      if (active && token === generation) {
        saving.value = false
      }
    }
    return saved
  }
  /** Rerun one original comparison; other variants and profiles stay visible. */
  function rerun(result: UiVisualResult) {
    // Result IDs derive from case and profile, so open review keeps following the recaptured result.
    const reviewing = viewerOpen.value
    start({ caseId: result.case.id, profileId: result.spec.id, baselineRef: result.baselineSource !== 'Working tree' ? result.baselineSource : undefined })
    viewerOpen.value = reviewing
  }
  /** Removing saved definition keeps historical image baselines intact. */
  async function remove(item: UiVisualCase) {
    try {
      await transport.request({ action: 'remove', caseId: item.id })
      await refresh()
    }
    catch (error) {
      if (active) {
        issue.value = (error as Error).message
      }
    }
  }
  /** Selected results open broad viewer without changing canonical story state. */
  function review(result: UiVisualResult) {
    selectedResultId.value = result.id
    viewerOpen.value = true
  }
  const stop = session.subscribe((snapshot) => {
    const next = JSON.stringify(snapshot.source)
    if (next !== source) {
      if (saving.value) issue.value = 'Saving visual cases cancelled; source changed'
      cancel()
      source = next
      generation++
      collection.retire()
      requestId.value = null
      if (run.value) run.value = { ...run.value, stale: true }
      saving.value = false
      approval.reset()
    }
    if (snapshot.status === 'ready' && !snapshot.stale && inventorySource !== next) {
      inventorySource = next
      void refresh()
    }
  })
  void refresh()
  return { cases, profiles, baselineRef, mode, profileId, baselineSource, run, results, completed, requestId, issue, saving, approving, inventoryLoading, selectedIds, selectedResultId, selectedResult, viewerOpen, refresh, start, rerun, busy: collection.busy, approvalPending: approval.pending, cancel, save, approve, remove, review,
    /** End provider-owned subscriptions and exact capture before late replies arrive. */
    close() {
      cancel()
      active = false
      generation++
      stop()
      stopFilters()
      transport.close()
    } }
}
/** Shared provider-local visual operations. */
export type WorkbenchVisual = ReturnType<typeof createWorkbenchVisual>
const key: InjectionKey<WorkbenchVisual> = Symbol('Histoire visual testing')
/** Root provides one model to pane, Matrix actions, and viewer. */
export function provideWorkbenchVisual(model: WorkbenchVisual): void {
  provide(key, model)
}
/** Static or feature-disabled consumers receive no visual model. */
export function useWorkbenchVisual(): WorkbenchVisual | undefined {
  return inject(key, undefined)
}
