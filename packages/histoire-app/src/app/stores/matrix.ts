import type { HistoireReadonly, HistoireSnapshot } from '@histoire/protocol'
import type { InjectionKey } from 'vue'
import type { MatrixAxis, MatrixProp, MatrixValue } from '../util/matrix.js'
import { computed, inject, provide, shallowRef } from 'vue'
import { discoverMatrixAxes, discoverMatrixProps, expandMatrixCells, filterMatrixValues, isMatrixPropName, resolveMatrixAxisPair } from '../util/matrix.js'
import { createMatrixRuntime } from './matrix-runtime.js'

/** Saved per-story choices exclude transient selected cell and runtime owners. */
export interface MatrixPreferences {
  /** Row axis prop name. */
  rows: string
  /** Column axis prop name. */
  cols: string
  /** Optional row subset; empty means intentionally no cells. */
  rowValues?: readonly MatrixValue[]
  /** Optional column subset. */
  colValues?: readonly MatrixValue[]
  /** Explicit user overrides; preset defaults stay outside persisted state. */
  base: Record<string, unknown>
}

/** Optional storage port follows same caller ownership as shell. */
interface MatrixStorage {
  /** Read preference JSON. */
  getItem: (key: string) => string | null
  /** Persist preference JSON. */
  setItem: (key: string, value: string) => void
}

/** Independent backing shared by matrix canvas and inspector in one workbench. */
export function createMatrixStore(options: { storage?: MatrixStorage } = {}) {
  const storyId = shallowRef('')
  const axes = shallowRef<readonly MatrixAxis[]>([])
  const props = shallowRef<readonly MatrixProp[]>([])
  const state = shallowRef<MatrixPreferences>({ rows: '', cols: '', base: {} })
  const provisional = shallowRef<Pick<MatrixPreferences, 'rows' | 'cols' | 'rowValues' | 'colValues'>>()
  const effective = computed(() => ({ ...state.value, ...provisional.value }))
  const seed = shallowRef<Record<string, unknown>>({})
  const selectedKey = shallowRef<string>()
  const records = new Map<string, MatrixPreferences>()
  const sources = new Map<string, () => Promise<string>>()
  const sourceRevision = shallowRef(0)
  let storage = options.storage
  let closed = false
  let hintedNames: readonly string[] = []
  let currentSnapshot: HistoireReadonly<HistoireSnapshot> | undefined
  let currentQuery: { rows?: string, cols?: string } = {}
  const runtime = createMatrixRuntime(refresh)
  const usableAxes = computed(() => axes.value.filter(axis => axis.values.length >= 2))
  const rowAxis = computed(() => usableAxes.value.find(axis => axis.name === effective.value.rows))
  const colAxis = computed(() => usableAxes.value.find(axis => axis.name === effective.value.cols))
  const baseProps = computed(() => Object.fromEntries(Object.entries({ ...seed.value, ...state.value.base }).filter(([name]) => name !== effective.value.rows && name !== effective.value.cols)))
  const cells = computed(() => rowAxis.value && colAxis.value ? expandMatrixCells(storyId.value, rowAxis.value, colAxis.value, baseProps.value, effective.value.rowValues, effective.value.colValues) : [])
  const selectedCell = computed(() => cells.value.find(cell => cell.key === selectedKey.value))
  const canCopy = computed(() => {
    void sourceRevision.value
    return Boolean(selectedCell.value && sources.has(selectedCell.value.key))
  })

  /** Persist atomic preference record; private browsing never breaks editing. */
  function save(): void {
    if (!storyId.value || closed) return
    records.set(storyId.value, state.value)
    try {
      storage?.setItem(`_histoire-ui-matrix/${storyId.value}`, JSON.stringify(state.value))
    }
    catch { /* Optional local persistence may be unavailable. */ }
  }
  /** Publishing removes selection when its filtered cell disappears. */
  function update(value: Partial<MatrixPreferences>): void {
    if (closed) return
    state.value = { ...state.value, ...value }
    if (Object.hasOwn(value, 'rows') || Object.hasOwn(value, 'cols')) provisional.value = undefined
    if (!cells.value.some(cell => cell.key === selectedKey.value)) selectedKey.value = undefined
    save()
  }
  /** Value filters follow exact axis names across provisional fallback and explicit swaps. */
  function axisPreferences(rows: string, cols: string, previous: MatrixPreferences) {
    const filters = new Map([[previous.rows, previous.rowValues], [previous.cols, previous.colValues]])
    const rowValues = filters.get(rows)
    const colValues = filters.get(cols)
    return {
      rows,
      cols,
      rowValues: rowValues === undefined ? undefined : filterMatrixValues(axes.value.find(axis => axis.name === rows)!, rowValues),
      colValues: colValues === undefined ? undefined : filterMatrixValues(axes.value.find(axis => axis.name === cols)!, colValues),
    }
  }
  /** Axis names resolve independently so a valid column survives invalid rows. */
  function selectAxes(rows?: string, cols?: string): void {
    const pair = resolveMatrixAxisPair(axes.value, { rows, cols }, effective.value, hintedNames)
    if (!pair) return
    const { rows: row, cols: col } = pair
    const base = Object.fromEntries(Object.entries(state.value.base).filter(([name]) => name !== row && name !== col))
    update({ ...axisPreferences(row, col, effective.value), base })
  }
  /** Source publications update candidates, retaining saved edits per exact story. */
  function activate(id: string, candidates: readonly MatrixAxis[], base: Record<string, unknown>, query: { rows?: string, cols?: string } = {}, hints: readonly string[] = [], fields?: readonly MatrixProp[], metadataReady = true): void {
    if (closed) return
    const changed = storyId.value !== id
    storyId.value = id
    axes.value = candidates
    props.value = fields ?? discoverMatrixProps(base)
    hintedNames = hints
    // Preset/runtime values seed untouched props. Only explicit edits survive
    // a preset switch, and defaults are never mistaken for persisted overrides.
    seed.value = Object.fromEntries(Object.entries(base).filter(([name]) => isMatrixPropName(name)))
    if (changed) {
      selectedKey.value = undefined
      let saved = records.get(id)
      if (!saved) {
        try {
          const parsed = JSON.parse(storage?.getItem(`_histoire-ui-matrix/${id}`) ?? 'null')
          if (parsed && typeof parsed === 'object' && parsed.base && typeof parsed.base === 'object' && !Array.isArray(parsed.base)) saved = parsed
        }
        catch { /* Unknown or malformed preferences use current source defaults. */ }
      }
      state.value = { rows: typeof saved?.rows === 'string' ? saved.rows : '', cols: typeof saved?.cols === 'string' ? saved.cols : '', rowValues: Array.isArray(saved?.rowValues) ? saved.rowValues : undefined, colValues: Array.isArray(saved?.colValues) ? saved.colValues : undefined, base: Object.fromEntries(Object.entries(saved?.base ?? {}).filter(([name]) => isMatrixPropName(name))) }
    }
    provisional.value = undefined
    if (metadataReady) {
      selectAxes(query.rows, query.cols)
    }
    else {
      // Hints can render immediately, but cannot replace preferences belonging
      // to automatic domains that have not arrived from their runtime yet.
      const pair = resolveMatrixAxisPair(axes.value, query, state.value, hintedNames)
      if (pair) provisional.value = axisPreferences(pair.rows, pair.cols, state.value)
    }
    if (!cells.value.some(cell => cell.key === selectedKey.value)) selectedKey.value = undefined
  }
  /** Recompute from owned metadata; passive callbacks never change canonical selection/state. */
  function refresh(): void {
    const snapshot = currentSnapshot
    if (closed || !snapshot) return
    const story = snapshot.catalog.stories.find(item => item.id === snapshot.selection?.storyId)
    if (!story) {
      storyId.value = ''
      axes.value = []
      props.value = []
      selectedKey.value = undefined
      provisional.value = undefined
      return
    }
    const projection = runtime.getProjection()
    const definitions = [{ props: projection?.axes.map(axis => ({ name: axis.name, values: axis.values })) ?? [] }]
    const hints = snapshot.status === 'ready' && !snapshot.stale && snapshot.source ? story.matrix : undefined
    activate(story.id, discoverMatrixAxes(definitions, hints), projection?.base ?? {}, currentQuery, Object.keys(hints?.axes ?? {}), projection?.props ?? [], Boolean(projection))
  }
  /** Grid mode discovers candidates using exact source, runtime and target ownership. */
  function synchronize(snapshot: HistoireReadonly<HistoireSnapshot>, query: { rows?: string, cols?: string } = {}): void {
    if (closed) return
    currentSnapshot = snapshot
    currentQuery = query
    runtime.synchronize(snapshot)
    refresh()
  }
  /** Only advertised values can survive a restored or user-selected filter. */
  function setFilter(dimension: 'rows' | 'cols', values: readonly MatrixValue[]): void {
    const axis = dimension === 'rows' ? rowAxis.value : colAxis.value
    if (!axis) return
    update({ ...axisPreferences(effective.value.rows, effective.value.cols, effective.value), ...(dimension === 'rows' ? { rowValues: filterMatrixValues(axis, values) } : { colValues: filterMatrixValues(axis, values) }) })
  }
  /** Base props never shadow selected axes or internal control definitions. */
  function setBase(name: string, value: unknown): void {
    if (!isMatrixPropName(name) || name === effective.value.rows || name === effective.value.cols) return
    update({ base: { ...state.value.base, [name]: value } })
  }
  /** Reset only shared overrides; canonical runtime state remains unchanged. */
  function resetBase(base: Record<string, unknown>): void {
    seed.value = Object.fromEntries(Object.entries(base).filter(([name]) => isMatrixPropName(name)))
    update({ base: {} })
  }
  /** Swap also transfers each axis filter rather than positional subsets. */
  function swapAxes(): void {
    selectAxes(effective.value.cols, effective.value.rows)
  }
  /** Cell selection stays local and never dispatches session selection. */
  function selectCell(key: string): void {
    if (!closed && cells.value.some(cell => cell.key === key)) selectedKey.value = key
  }
  /** Runtime-owned source generator registration cannot remove its successor. */
  function registerSource(key: string, source: () => Promise<string>): () => void {
    if (closed) return () => {}
    sources.set(key, source)
    sourceRevision.value++
    return () => {
      if (sources.get(key) !== source) return
      sources.delete(key)
      sourceRevision.value++
    }
  }
  /** Await framework source only while same cell and props still own request. */
  async function sourceForSelected(): Promise<string> {
    const cell = selectedCell.value
    const source = cell && sources.get(cell.key)
    if (closed || !cell || !source) throw new Error('Selected matrix cell is not ready')
    const result = await source()
    if (closed || selectedCell.value?.props !== cell.props || sources.get(cell.key) !== source) throw new Error('Selected matrix cell changed')
    return result
  }
  /** Attach exact caller storage before first story activation. */
  function restore(value: MatrixStorage): void {
    if (!closed && !storage) storage = value
  }
  /** Dispose local registrations; caller retains canonical session. */
  function close(): void {
    closed = true
    runtime.close()
    currentSnapshot = undefined
    sources.clear()
    sourceRevision.value++
    records.clear()
    storage = undefined
  }
  return { storyId: computed(() => storyId.value), axes: computed(() => axes.value), props: computed(() => props.value), usableAxes, rowAxis, colAxis, cells, selectedCell, canCopy, rows: computed(() => effective.value.rows), cols: computed(() => effective.value.cols), rowValues: computed(() => effective.value.rowValues), colValues: computed(() => effective.value.colValues), base: baseProps, available: computed(() => usableAxes.value.length >= 2), activate, synchronize, selectAxes, setFilter, setBase, resetBase, swapAxes, selectCell, registerSource, sourceForSelected, registerRuntimeObserver: runtime.registerRuntimeObserver, restore, close }
}

/** Injectable state belongs to one workbench, independent of canonical selection. */
export type MatrixStore = ReturnType<typeof createMatrixStore>
const key: InjectionKey<MatrixStore> = Symbol('Histoire props matrix')

/** Share local state without taking caller session ownership. */
export function provideMatrix(store: MatrixStore): void {
  provide(key, store)
}

/** Matrix canvas and inspector consume same small explicit backing. */
export function useMatrixStore(): MatrixStore {
  const store = inject(key)
  if (!store) throw new Error('Props matrix requires provideMatrix()')
  return store
}
