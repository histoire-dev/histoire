import type { HistoireVisualRunOptions, UiVisualResult } from '@histoire/shared'
import type { Ref } from 'vue'
import type { createVisualTransport } from './visual-transport.js'
import { computed, shallowRef } from 'vue'

/** Client-side marker set on source change until server recovery revalidates evidence. */
const RETIRED_REASON = 'Source changed; reconnect to validate capture'

/** Cached evidence lives independently from active capture progress. */
export function createVisualCollection(transport: ReturnType<typeof createVisualTransport>, state: () => { active: boolean, generation: number }, filters: { profileId: Ref<string>, baselineSource: Ref<'working' | 'main'>, baselineRef: Ref<string> }) {
  const entries = shallowRef<UiVisualResult[]>([])
  const scope = shallowRef<Omit<HistoireVisualRunOptions, 'signal'>>()
  /** Incremental runs busy only server-announced result IDs, not their whole filter scope. */
  const planned = shallowRef(new Set<string>())
  const results = computed(() => entries.value.filter(result => (!filters.profileId.value || result.spec.id === filters.profileId.value) && (result.baselineSource ?? 'Working tree') === (filters.baselineSource.value === 'main' ? filters.baselineRef.value : 'Working tree')))
  /** Exact comparison namespace, including baseline source, survives changing selectors. */
  function key(result: UiVisualResult): string {
    return result.comparisonKey ?? `${result.baselineSource ?? 'Working tree'}:${result.id}`
  }
  /** Targeted captures replace only matching case/profile/source; preserve other variants. */
  function merge(values: UiVisualResult[]): void {
    const next = new Map(entries.value.map(result => [key(result), result]))
    for (const result of values) {
      if (result.status === 'cancelled' && next.has(key(result))) continue
      next.set(key(result), result)
    }
    entries.value = [...next.values()]
  }
  /** Recover bounded metadata pages, abandoning late replies after runtime retirement. */
  async function recover(): Promise<string[]> {
    const token = state().generation
    const values: UiVisualResult[] = []
    const issues: string[] = []
    let offset: number | undefined = 0
    do {
      const reply = await transport.request({ action: 'recover', offset })
      if (!state().active || state().generation !== token || scope.value) return []
      if (!reply.recovered) throw new Error('Visual recovery unavailable')
      values.push(...reply.recovered.results)
      issues.push(...reply.recovered.issues)
      offset = reply.recovered.nextOffset
    } while (offset !== undefined)
    // Recovery is a complete inventory; removed or damaged entries cannot stay current.
    entries.value = values
    return issues
  }
  /** Only rows selected by active capture become busy and lose approval controls. */
  function busy(result: UiVisualResult): boolean {
    const options = scope.value
    if (!options || (result.baselineSource ?? 'Working tree') !== (options.baselineRef ?? 'Working tree')) return false
    if (options.incremental) return planned.value.has(result.id)
    return (!options.profileId || options.profileId === result.spec.id) && (!options.caseId || options.caseId === result.case.id) && (!options.storyId || options.storyId === result.case.storyId) && (!options.variantId || options.variantId === result.case.variantId)
  }
  return { results, merge, recover, busy,
    /** Capture scope is distinct from stored historical evidence. */
    begin(options: Omit<HistoireVisualRunOptions, 'signal'>) {
      scope.value = { ...options }
      planned.value = new Set()
    },
    /** Accumulate one streamed chunk of result IDs the incremental run will capture. */
    plan(ids: string[]) { planned.value = new Set([...planned.value, ...ids]) },
    /** Completed or disconnected work can no longer keep historical rows busy. */
    finish() { scope.value = undefined },
    /** Retire local approval until per-result recovery can revalidate dependencies. */
    retire() {
      scope.value = undefined
      entries.value = entries.value.map(result => ({ ...result, staleReason: RETIRED_REASON }))
    },
    /** True while some rows still await server revalidation after a source change. */
    hasRetired() { return entries.value.some(result => result.staleReason === RETIRED_REASON) },
    /** Receipts update captured evidence even after selector changes, never its replacement. */
    approved(targets: UiVisualResult[]) {
      const selected = new Map(targets.map(result => [key(result), result.reviewHandle]))
      entries.value = entries.value.map(result => selected.has(key(result)) && selected.get(key(result)) === result.reviewHandle ? { ...result, approved: true } : result)
    } }
}
