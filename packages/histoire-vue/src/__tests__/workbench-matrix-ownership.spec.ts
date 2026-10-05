import { describe, expect, it } from 'vitest'
import { createCanvasArrangement } from '../../../histoire-app/src/app/components/canvas/frame-arrangement.js'
import { createMatrixStore } from '../../../histoire-app/src/app/stores/matrix.js'
import { createEmbedSnapshot } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'

/** Ready matrix source uses existing portable snapshot fixture and exact target. */
function matrixSnapshot(variantId: string | null = 'c', message = 'First') {
  const snapshot = createEmbedSnapshot()
  snapshot.catalog.stories[0].runtimeRevision = 'executable-1'
  snapshot.selection = { storyId: 'a:b', variantId }
  if (variantId) {
    snapshot.runtime = { ...snapshot.runtime, status: 'ready', runtimeId: 'runtime-1' }
    snapshot.state = { target: { ...snapshot.selection }, runtimeId: 'runtime-1', value: { enabled: false, emphasized: true, message } }
  }
  return snapshot
}

describe('matrix metadata runtime ownership', () => {
  it('bootstraps restored chooser Matrix intent through ordinary previews and retains empty filters', () => {
    const saved = JSON.stringify({ rows: 'enabled', cols: 'emphasized', rowValues: [], base: {} })
    const store = createMatrixStore({ storage: { getItem: () => saved, setItem: () => {} } })
    const chooser = matrixSnapshot(null)
    const rendered = createCanvasArrangement(() => 'matrix', store)
    store.synchronize(chooser)
    expect(rendered.value).toBe('grid')
    const observer = store.registerRuntimeObserver()
    observer.capture(matrixSnapshot())
    expect(rendered.value).toBe('matrix')
    expect(store.cells.value).toEqual([])
    expect(chooser.selection?.variantId).toBeNull()
    observer.close()
    store.synchronize(chooser)
    expect(rendered.value).toBe('matrix')
    chooser.source!.epoch = 'epoch-2'
    store.synchronize(chooser)
    expect(rendered.value).toBe('grid')
    const successor = store.registerRuntimeObserver()
    successor.capture(matrixSnapshot())
    expect(rendered.value).toBe('grid')
    const current = matrixSnapshot()
    current.source!.epoch = 'epoch-2'
    successor.capture(current)
    expect(rendered.value).toBe('matrix')
    expect(store.rowValues.value).toEqual([])
    successor.close()
    store.close()
  })

  it('uses provisional hints without erasing saved automatic axes before metadata arrives', () => {
    const saved = JSON.stringify({ rows: 'enabled', cols: 'emphasized', rowValues: [true], base: {} })
    const writes: string[] = []
    const store = createMatrixStore({ storage: { getItem: () => saved, setItem: (_key, value) => writes.push(value) } })
    const pending = matrixSnapshot()
    pending.catalog.stories[0].matrix = { axes: { tone: ['light', 'dark'], size: ['small', 'large'] } }
    pending.runtime.status = 'mounting'
    pending.state = null
    store.synchronize(pending)
    expect(store.available.value).toBe(true)
    expect(store.rows.value).toBe('tone')
    expect(store.cols.value).toBe('size')
    expect(writes).toEqual([])
    const ready = matrixSnapshot()
    ready.catalog.stories[0].matrix = pending.catalog.stories[0].matrix
    store.synchronize(ready)
    expect(store.rows.value).toBe('enabled')
    expect(store.cols.value).toBe('emphasized')
    expect(store.rowValues.value).toEqual([true])
    expect(store.cells.value).toHaveLength(2)
    store.close()
  })

  it('uses existing first-variant observer in chooser and retains detached projection after close', () => {
    const store = createMatrixStore()
    const chooser = matrixSnapshot(null)
    store.synchronize(chooser)
    const alternate = store.registerRuntimeObserver()
    alternate.capture(matrixSnapshot('other', 'Wrong preset'))
    expect(store.available.value).toBe(false)
    const first = store.registerRuntimeObserver()
    const observed = matrixSnapshot()
    first.capture(observed)
    expect(store.available.value).toBe(true)
    expect(store.cells.value).toHaveLength(4)
    expect(store.base.value.message).toBe('First')
    expect(store.props.value.find(prop => prop.name === 'message')).toMatchObject({ value: 'First', type: 'string' })
    first.close()
    observed.state!.value.message = 'Mutated caller'
    store.synchronize(chooser)
    expect(store.base.value.message).toBe('First')
    first.capture(matrixSnapshot('c', 'Retired'))
    expect(store.base.value.message).toBe('First')
    alternate.close()
    store.close()
  })

  it('rejects wrong target, runtime, stale source, and old executable generation', () => {
    const store = createMatrixStore()
    const current = matrixSnapshot(null)
    store.synchronize(current)
    const observer = store.registerRuntimeObserver()
    const wrongRuntime = matrixSnapshot()
    wrongRuntime.state!.runtimeId = 'retired'
    observer.capture(wrongRuntime)
    const stale = matrixSnapshot()
    stale.stale = true
    observer.capture(stale)
    const wrongTarget = matrixSnapshot()
    wrongTarget.state!.target.variantId = 'other'
    observer.capture(wrongTarget)
    expect(store.available.value).toBe(false)
    observer.capture(matrixSnapshot())
    expect(store.available.value).toBe(true)
    current.catalog.stories[0].runtimeRevision = 'executable-2'
    store.synchronize(current)
    expect(store.available.value).toBe(false)
    observer.capture(matrixSnapshot())
    expect(store.available.value).toBe(false)
    observer.close()
    store.close()
  })

  it('fresh canonical metadata wins and unrelated catalog revisions preserve detection', () => {
    const store = createMatrixStore()
    const current = matrixSnapshot(null)
    store.synchronize(current)
    const observer = store.registerRuntimeObserver()
    observer.capture(matrixSnapshot('c', 'Passive'))
    current.source!.revision = 'unrelated-publication'
    store.synchronize(current)
    expect(store.base.value.message).toBe('Passive')
    const selected = matrixSnapshot('c', 'Canonical')
    selected.source!.revision = current.source!.revision
    store.synchronize(selected)
    observer.capture(matrixSnapshot('c', 'Later passive'))
    expect(store.base.value.message).toBe('Canonical')
    const pendingAlternate = matrixSnapshot('other')
    pendingAlternate.state = null
    pendingAlternate.runtime.status = 'mounting'
    store.synchronize(pendingAlternate)
    expect(store.base.value.message).toBeUndefined()
    observer.close()
    store.close()
  })

  it('does not reclassify retained state as fresh after epoch change', () => {
    const store = createMatrixStore()
    const snapshot = matrixSnapshot()
    store.synchronize(snapshot)
    expect(store.available.value).toBe(true)
    snapshot.source!.epoch = 'epoch-2'
    store.synchronize(snapshot)
    expect(store.available.value).toBe(false)
    snapshot.state = { ...snapshot.state!, value: { enabled: true, emphasized: false, message: 'New generation' } }
    store.synchronize(snapshot)
    expect(store.available.value).toBe(true)
    expect(store.base.value.message).toBe('New generation')
    store.close()
  })
})
