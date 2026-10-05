import type { HistoireCatalog, HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { HistoireTestsModel } from '@histoire/vue/internal'
import type { InjectionKey } from 'vue'
import type { WorkbenchTestEntry, WorkbenchTestsOptions } from './types.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, inject, provide, shallowRef, watch } from 'vue'
import { createWorkbenchTestDiscovery } from './discovery.js'
import { assertWorkbenchTestRunOwner, createWorkbenchTestJobs, projectWorkbenchTestResult } from './execution.js'
import { emptyTestEntry, isVisibleTestRow, projectTestRows, summarizeTestRows } from './projection.js'

/** Capture catalog-executable provenance by story so unrelated catalog fields retain completed cache. */
function executableStoryProvenance(catalog: HistoireCatalog): Map<string, string | undefined> {
  return new Map(catalog.stories.filter(story => !story.docsOnly).map(story => [story.id, story.runtimeRevision]))
}

/** Aggregate project facts share actual SDK preview results and existing server execution. */
export function createWorkbenchTestsModel(session: HistoireSession, selected?: HistoireTestsModel, options: WorkbenchTestsOptions = {}) {
  const snapshot = shallowRef(session.getSnapshot())
  const entries = shallowRef(new Map<string, WorkbenchTestEntry>())
  const running = shallowRef(false)
  const error = shallowRef<unknown>(null)
  const completed = shallowRef(0)
  const total = shallowRef(0)
  const executionDuration = shallowRef<number | null>(null)
  const serverTargets = new Set<string>()
  const watchTests = shallowRef(false)
  const pending = new Set<string>()
  const epochs = new Map<string, number>()
  let active = true
  let generation = 0
  let abort: AbortController | undefined
  let source = JSON.stringify([snapshot.value.source?.sourceId, snapshot.value.source?.epoch])
  let publication = snapshot.value.source?.revision
  let executableStories = executableStoryProvenance(snapshot.value.catalog)
  let settings: Record<string, unknown> = {}
  try {
    settings = JSON.parse(options.storage?.getItem('_histoire-ui-settings') ?? '{}')
    watchTests.value = settings.watchTests === true
  }
  catch { /* Corrupt preferences cannot block explicit execution. */ }
  if (options.settings) watchTests.value = options.settings.state.watchTests
  const stopSettings = options.settings
    ? watch(() => options.settings!.state.watchTests, (value) => {
        watchTests.value = value
        if (!value) pending.clear()
      }, { flush: 'sync' })
    : () => {}
  const rows = computed(() => projectTestRows(snapshot.value.catalog, entries.value))
  const visibleRows = computed(() => rows.value.filter(isVisibleTestRow))
  const summary = computed(() => ({ ...summarizeTestRows(visibleRows.value), ...(executionDuration.value === null ? {} : { duration: executionDuration.value }) }))
  const canRun = computed(() => !!(options.run || options.runProject || options.runStory) && snapshot.value.source?.mode === 'dev' && snapshot.value.status === 'ready' && !snapshot.value.stale && (snapshot.value.capabilities.serverTests.available || snapshot.value.capabilities.serverTests.reason === 'SELECTION_REQUIRED'))
  /** Copy map on publication so reactive subscribers see one coherent target update. */
  function update(target: HistoireTarget, patch: Partial<WorkbenchTestEntry>) {
    updateTargets([target], () => patch)
  }
  /** Bulk publication copies one map, avoiding quadratic per-variant copies. */
  function updateTargets(targets: readonly HistoireTarget[], patch: (target: HistoireTarget) => Partial<WorkbenchTestEntry>) {
    if (!active) return
    const next = new Map(entries.value)
    for (const target of targets) {
      const key = getHistoireTargetKey(target)
      next.set(key, { ...next.get(key) ?? emptyTestEntry(target), ...patch(target) })
    }
    entries.value = next
  }
  /** Cancellation suppresses late completion while actual engine retains its teardown lane. */
  function cancel(clearPending = true) {
    generation++
    abort?.abort()
    abort = undefined
    if (clearPending) pending.clear()
    running.value = false
    const targets = [...entries.value.values()].filter(entry => serverTargets.has(getHistoireTargetKey(entry.target))).map(entry => entry.target)
    serverTargets.clear()
    updateTargets(targets, () => ({ running: false, stale: true }))
  }
  const discovery = createWorkbenchTestDiscovery(options, {
    snapshot: () => snapshot.value,
    entries: () => entries.value,
    epoch: id => epochs.get(id) ?? 0,
    running: () => running.value,
    apply(variants) {
      const collections = new Map(variants.map(entry => [getHistoireTargetKey(entry.target), entry.collection]))
      updateTargets(variants.map(entry => entry.target), target => ({ collection: collections.get(getHistoireTargetKey(target))!, error: collections.get(getHistoireTargetKey(target))!.error ?? null }))
    },
  })
  /** Detect catalog-only executable changes when an exact HMR story event is absent. */
  function invalidateChangedExecutableStories(catalog: HistoireCatalog) {
    const next = executableStoryProvenance(catalog)
    for (const [storyId, provenance] of next) {
      const previous = executableStories.get(storyId)
      // Missing provenance is conservative: later publication can contain new bytes
      // although no digest is available to prove that the completed cache is current.
      if (previous === undefined || provenance === undefined || previous !== provenance) invalidate(storyId)
    }
    executableStories = next
  }
  const stop = session.subscribe((value) => {
    const catalogChanged = snapshot.value.catalog !== value.catalog
    snapshot.value = value
    if (value.status !== 'ready') cancel()
    else if (value.stale) cancel(false)
    if (publication !== value.source?.revision) {
      publication = value.source?.revision
      cancel(false)
    }
    const selectedSource = selected?.state.value.source
    if (value.status !== 'ready' || value.stale || (selectedSource && selectedSource.revision !== value.source?.revision)) {
      updateTargets([...entries.value.values()].filter(entry => entry.running && !serverTargets.has(getHistoireTargetKey(entry.target))).map(entry => entry.target), () => ({ running: false, stale: true }))
    }
    const identity = JSON.stringify([value.source?.sourceId, value.source?.epoch])
    if (source !== identity) {
      source = identity
      cancel()
      entries.value = new Map()
      executionDuration.value = null
      epochs.clear()
    }
    if (catalogChanged) invalidateChangedExecutableStories(value.catalog)
    const targets = new Set(value.catalog.stories.flatMap(story => story.variants.map(variant => getHistoireTargetKey({ storyId: story.id, variantId: variant.id }))))
    if ([...entries.value.keys()].some(key => !targets.has(key))) entries.value = new Map([...entries.value].filter(([key]) => targets.has(key)))
    discovery.refresh()
    if (value.status === 'ready' && !value.stale) void drain()
  })
  const stopSelected = selected
    ? watch(selected.state, (state) => {
        const current = session.getSnapshot()
        const target = state.target === undefined ? current.selection : state.target
        if (state.source && (state.source.sourceId !== current.source?.sourceId || state.source.epoch !== current.source?.epoch || state.source.revision !== current.source?.revision)) return
        if (!target || target.variantId === null) return
        const previous = entries.value.get(getHistoireTargetKey(target))
        const serverRunning = serverTargets.has(getHistoireTargetKey(target))
        if (state.status === 'collecting' || state.status === 'running') {
          update(target, { running: true, error: null })
          return
        }
        if (state.status === 'cancelled') {
          if (previous?.running) update(target, { running: serverRunning, stale: true })
          return
        }
        if (!state.collection && !state.summary && !state.error) return
        // Definition refresh does not turn a stale last run into current facts.
        update(target, { running: serverRunning, collection: state.collection, summary: state.summary ?? previous?.summary ?? null, error: state.error ?? state.collection?.error ?? null, stale: state.summary ? false : previous?.stale ?? false })
      }, { flush: 'sync', immediate: true })
    : () => {}
  /** Exact changed story invalidates its targets and queues only those in watch mode. */
  function invalidate(storyId: string) {
    if (!active) return
    epochs.set(storyId, (epochs.get(storyId) ?? 0) + 1)
    for (const entry of entries.value.values()) {
      if (entry.target.storyId === storyId) update(entry.target, { stale: true, collection: null, error: null })
    }
    discovery.invalidate(storyId)
    if (watchTests.value) {
      pending.add(storyId)
      void drain()
    }
  }
  const stopChanged = options.onStoryChanged?.(invalidate) ?? (() => {})
  /** One shared-server batch per model; duplicate Run all requests are ignored. */
  async function execute(targets: readonly HistoireTarget[], project = false) {
    if (!active || running.value || !canRun.value) return
    const jobs = createWorkbenchTestJobs(targets, options, project)
    if (!jobs.length) return
    discovery.preempt()
    const current = ++generation
    abort = new AbortController()
    const signal = abort.signal
    running.value = true
    error.value = null
    completed.value = 0
    total.value = targets.length
    executionDuration.value = null
    const batchStarted = performance.now()
    try {
      for (const job of jobs) {
        if (!active || current !== generation) break
        const captured = new Map(job.targets.map(target => [target.storyId, epochs.get(target.storyId) ?? 0]))
        const runSource = snapshot.value.source
        const started = performance.now()
        for (const target of job.targets) serverTargets.add(getHistoireTargetKey(target))
        updateTargets(job.targets, () => ({ running: true, error: null }))
        try {
          const result = await job.run(signal)
          if (active && current === generation) {
            assertWorkbenchTestRunOwner(result, runSource)
            const patches = projectWorkbenchTestResult(result, job.targets, snapshot.value.catalog, job.bulk)
            const valid = job.targets.filter(target => (epochs.get(target.storyId) ?? 0) === captured.get(target.storyId))
            updateTargets(valid, target => ({ ...patches.get(getHistoireTargetKey(target)), duration: job.bulk ? null : performance.now() - started, stale: false }))
          }
        }
        catch (failure) {
          if (active && current === generation && !signal.aborted) {
            const retired = ['CANCELLED', 'STALE_REVISION', 'RUNTIME_CHANGED'].includes((failure as { code?: string })?.code ?? '')
            if (!retired) error.value = failure
            const valid = job.targets.filter(target => (epochs.get(target.storyId) ?? 0) === captured.get(target.storyId))
            updateTargets(valid, () => ({ error: retired ? null : failure, stale: retired }))
          }
        }
        finally {
          if (active && current === generation) {
            for (const target of job.targets) serverTargets.delete(getHistoireTargetKey(target))
            updateTargets(job.targets, () => ({ running: false }))
            completed.value += job.targets.length
          }
        }
      }
    }
    finally {
      if (active && current === generation) {
        running.value = false
        if (jobs.some(job => job.bulk)) executionDuration.value = performance.now() - batchStarted
        abort = undefined
        // HMR may queue discovery while assertions own the shared execution lane.
        discovery.refresh()
        void drain()
      }
    }
  }
  /** Watch changes during a run merge into one later affected-target batch. */
  async function drain() {
    if (!active || !watchTests.value || running.value || !pending.size || !canRun.value) return
    const changed = new Set(pending)
    pending.clear()
    await execute(rows.value.filter(row => row.target.variantId !== null && changed.has(row.target.storyId)).map(row => row.target))
  }
  /** Persist only watch setting while retaining every unrelated settings field. */
  function setWatch(value: boolean) {
    watchTests.value = value
    if (options.settings) {
      options.settings.update({ watchTests: value })
      if (!value) pending.clear()
      return
    }
    try {
      settings = JSON.parse(options.storage?.getItem('_histoire-ui-settings') ?? JSON.stringify(settings))
    }
    catch { /* Retain last readable settings when storage is blocked or corrupt. */ }
    settings = { ...settings, watchTests: value }
    try {
      options.storage?.setItem('_histoire-ui-settings', JSON.stringify(settings))
    }
    catch { /* Private/blocked storage preserves working in-memory watch mode. */ }
    if (!value) pending.clear()
  }
  discovery.refresh()
  return { discoveryStatus: discovery.status, discoveryError: discovery.error, retryCollection: discovery.retry, session, rows, visibleRows, summary, entries, running, error, completed, total, watchTests, canRun, cancel, invalidate, setWatch,
    /** Pause only this provider's background definitions while an interactive capture owns work. */
    suspendDiscovery: discovery.suspend,
    /** Explicit project execution covers all collected non-document variants. */
    runAll: () => execute(rows.value.filter(row => row.target.variantId !== null && row.selectable).map(row => row.target), true),
    /** Close only project observers/requests; caller keeps canonical session ownership. */
    close() {
      if (!active) return
      cancel()
      discovery.close()
      active = false
      stop()
      stopSelected()
      stopChanged()
      stopSettings()
    } }
}

/** Project model lifetime follows standalone bootstrap, independent of visible pane. */
export type WorkbenchTestsModel = ReturnType<typeof createWorkbenchTestsModel>
const key: InjectionKey<WorkbenchTestsModel> = Symbol('Histoire project tests')
/** Provide explicitly owned aggregate facts alongside existing SDK selected-tests model. */
export function provideWorkbenchTestsModel(model: WorkbenchTestsModel): void {
  provide(key, model)
}
/** Optional lookup keeps public SDK components and static pages independently usable. */
export function useWorkbenchTestsModel(session: HistoireSession = useHistoireContext().session): WorkbenchTestsModel | undefined {
  const model = inject(key, undefined)
  return model?.session === session ? model : undefined
}
