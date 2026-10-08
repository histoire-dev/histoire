import type { HistoireReadonly, HistoireSnapshot } from '@histoire/protocol'
import type { InjectionKey } from 'vue'
import type { MatrixAxis, MatrixProp, MatrixValue } from '../util/matrix.js'
import type { MatrixPreferences, MatrixStorage } from './matrix-preferences.js'
import { getHistoireNumericMatrixValues } from '@histoire/protocol'
import { computed, inject, provide, shallowRef } from 'vue'
import { normalizeMatrixCustomValues } from '../util/matrix-values.js'
import { discoverMatrixAxes, discoverMatrixProps, expandMatrixCells, filterMatrixValues, isMatrixPropName } from '../util/matrix.js'
import { createMatrixAxisEditor } from './matrix-axis-editor.js'
import { composeMatrixAxes, matrixAxisPreferences, resolveMatrixSelection, validateMatrixDomainEdit } from './matrix-domains.js'
import { isNumericMatrixAxis, restoreMatrixPreferences } from './matrix-preferences.js'
import { createMatrixRuntime } from './matrix-runtime.js'

export type { MatrixPreferences } from './matrix-preferences.js'

/** Independent backing shared by matrix canvas and inspector in one workbench. */
export function createMatrixStore(options: {
  /** Optional caller-owned local preference storage. */
  storage?: MatrixStorage
  /** Current descriptor samples; absent on disconnected or older sources. */
  numericValues?: () => readonly number[] | undefined
} = {}) {
  const storyId = shallowRef('')
  const defaultAxes = shallowRef<readonly MatrixAxis[]>([])
  const props = shallowRef<readonly MatrixProp[]>([])
  /** A ready projection can contain zero axes; availability is a separate question. */
  const metadataReady = shallowRef(false)
  const state = shallowRef<MatrixPreferences>({ rows: '', cols: '', base: {} })
  let hintedNames: readonly string[] = []
  const axes = computed(() => composeMatrixAxes(defaultAxes.value, props.value, state.value, hintedNames))
  const provisional = shallowRef<Pick<MatrixPreferences, 'rows' | 'cols' | 'rowValues' | 'colValues'>>()
  const effective = computed(() => ({ ...state.value, ...provisional.value }))
  const seed = shallowRef<Record<string, unknown>>({})
  const selectedKey = shallowRef<string>()
  const records = new Map<string, MatrixPreferences>()
  const sources = new Map<string, () => Promise<string>>()
  const sourceRevision = shallowRef(0)
  /** Explicit domain edits publish axis-name changes independently of passive discovery. */
  const axisRevision = shallowRef(0)
  let storage = options.storage
  let closed = false
  let currentSnapshot: HistoireReadonly<HistoireSnapshot> | undefined
  let currentQuery: { rows?: string, cols?: string } = {}
  const runtime = createMatrixRuntime(refresh)
  const axisEditor = createMatrixAxisEditor(storyId)
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
  /** Axis names resolve independently so a valid column survives invalid rows. */
  function selectAxes(rows?: string, cols?: string): void {
    if (usableAxes.value.length < 2) return
    const pair = resolveMatrixSelection(axes.value, { rows, cols }, effective.value, hintedNames)
    const { rows: row, cols: col } = pair
    const base = Object.fromEntries(Object.entries(state.value.base).filter(([name]) => name !== row && name !== col))
    update({ ...matrixAxisPreferences(axes.value, row, col, effective.value), base })
  }
  /** Source publications update candidates, retaining saved edits per exact story. */
  function activate(id: string, candidates: readonly MatrixAxis[], base: Record<string, unknown>, query: { rows?: string, cols?: string } = {}, hints: readonly string[] = [], fields?: readonly MatrixProp[], ready = true): void {
    if (closed) return
    const changed = storyId.value !== id
    storyId.value = id
    hintedNames = hints
    defaultAxes.value = candidates
    props.value = fields ?? discoverMatrixProps(base)
    metadataReady.value = ready
    // Preset/runtime values seed untouched props. Only explicit edits survive
    // a preset switch, and defaults are never mistaken for persisted overrides.
    seed.value = Object.fromEntries(Object.entries(base).filter(([name, value]) => isMatrixPropName(name) && value !== undefined))
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
      state.value = restoreMatrixPreferences(saved)
    }
    provisional.value = undefined
    if (ready) {
      selectAxes(query.rows, query.cols)
    }
    else {
      // Hints can render immediately, but cannot replace preferences belonging
      // to automatic domains that have not arrived from their runtime yet.
      const pair = resolveMatrixSelection(axes.value, query, state.value, hintedNames)
      if (pair.rows && pair.cols) provisional.value = matrixAxisPreferences(axes.value, pair.rows, pair.cols, state.value)
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
      state.value = { rows: '', cols: '', base: {} }
      seed.value = {}
      defaultAxes.value = []
      props.value = []
      metadataReady.value = false
      selectedKey.value = undefined
      provisional.value = undefined
      return
    }
    const projection = runtime.getProjection()
    const definitions = [{ props: projection?.props.map(prop => ({ name: prop.name, types: prop.numeric ? ['number'] : [], values: projection.axes.find(axis => axis.name === prop.name)?.values })) ?? [] }]
    const hints = snapshot.status === 'ready' && !snapshot.stale && snapshot.source ? story.matrix : undefined
    activate(story.id, discoverMatrixAxes(definitions, hints, undefined, { numericValues: options.numericValues?.() }), projection?.base ?? {}, currentQuery, Object.keys(hints?.axes ?? {}), projection?.props ?? [], Boolean(projection))
  }
  /** All arrangements discover candidates using exact source, runtime and target ownership. */
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
    update({ ...matrixAxisPreferences(axes.value, effective.value.rows, effective.value.cols, effective.value), ...(dimension === 'rows' ? { rowValues: filterMatrixValues(axis, values) } : { colValues: filterMatrixValues(axis, values) }) })
  }
  /** Validate complete candidate/cell projection before publishing a domain edit. */
  function publishDomain(name: string, patch: Partial<MatrixPreferences>): void {
    const next = { ...state.value, ...effective.value, ...patch, ...(effective.value.rows === name ? { rowValues: undefined } : {}), ...(effective.value.cols === name ? { colValues: undefined } : {}) }
    const candidates = composeMatrixAxes(defaultAxes.value, props.value, next, hintedNames)
    const pair = resolveMatrixSelection(candidates, {}, next, hintedNames)
    const value = { ...next, ...matrixAxisPreferences(candidates, pair.rows, pair.cols, next) }
    validateMatrixDomainEdit(storyId.value, candidates, value, { ...seed.value, ...value.base })
    const changed = pair.rows !== effective.value.rows || pair.cols !== effective.value.cols
    update(value)
    if (changed) axisRevision.value++
  }
  /** User-authored domains can introduce literal props absent from runtime metadata. */
  function setCustomAxis(input: string, values: readonly MatrixValue[]): void {
    if (closed || !storyId.value) return
    const name = input.trim()
    if (!isMatrixPropName(name)) throw new Error('Enter a valid prop name')
    const customAxes = { ...state.value.customAxes, [name]: normalizeMatrixCustomValues(values) }
    if (!Object.hasOwn(state.value.customAxes ?? {}, name) && new Set([...hintedNames, ...Object.keys(customAxes)]).size > 32) throw new Error('Matrix supports at most 32 axes')
    const numericValues = { ...state.value.numericValues }
    delete numericValues[name]
    publishDomain(name, { customAxes, numericValues })
  }
  /** Removing a local domain restores latest source defaults, or removes its axis. */
  function removeCustomAxis(name: string): void {
    if (closed) return
    const customAxes = { ...state.value.customAxes }
    const numericValues = { ...state.value.numericValues }
    delete customAxes[name]
    delete numericValues[name]
    publishDomain(name, { customAxes, numericValues })
  }
  /** Numeric editing shares custom entries when user explicitly introduced this axis. */
  function setNumericValues(name: string, input: readonly number[]): void {
    const values = getHistoireNumericMatrixValues(input)
    if (!values) throw new Error('Values must contain 2–64 distinct finite numbers')
    if (state.value.customAxes?.[name]) return setCustomAxis(name, values)
    const axis = defaultAxes.value.find(axis => axis.name === name)
    if (closed || !axis || !isNumericMatrixAxis(axis, props.value)) return
    publishDomain(name, { numericValues: { ...state.value.numericValues, [name]: values } })
  }
  /** Reset removes local domain edits and restores current source values. */
  function resetNumericValues(name: string): void {
    removeCustomAxis(name)
  }
  /** Base props never shadow selected axes or internal control definitions. */
  function setBase(name: string, value: unknown): void {
    if (!isMatrixPropName(name) || name === effective.value.rows || name === effective.value.cols) return
    update({ base: { ...state.value.base, [name]: value } })
  }
  /** Reset only shared overrides; canonical runtime state remains unchanged. */
  function resetBase(base: Record<string, unknown>): void {
    seed.value = Object.fromEntries(Object.entries(base).filter(([name, value]) => isMatrixPropName(name) && value !== undefined))
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
    metadataReady.value = false
    runtime.close()
    currentSnapshot = undefined
    sources.clear()
    sourceRevision.value++
    records.clear()
    storage = undefined
  }
  return { storyId: computed(() => storyId.value), axes, axisRevision: computed(() => axisRevision.value), customAxes: computed(() => Object.freeze({ ...state.value.customAxes })), props: computed(() => props.value), metadataReady: computed(() => metadataReady.value), usableAxes, rowAxis, colAxis, cells, selectedCell, canCopy, rows: computed(() => effective.value.rows), cols: computed(() => effective.value.cols), rowValues: computed(() => effective.value.rowValues), colValues: computed(() => effective.value.colValues), base: baseProps, available: computed(() => usableAxes.value.length >= 2), activate, synchronize, selectAxes, setFilter, setCustomAxis, removeCustomAxis, setNumericValues, resetNumericValues, setBase, resetBase, swapAxes, selectCell, registerSource, sourceForSelected, registerRuntimeObserver: runtime.registerRuntimeObserver, restore, close, axisEditor }
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
