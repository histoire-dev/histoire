import { HistoireSdkError } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createFrameActions } from '../../../../histoire-app/src/app/util/frame-actions.js'
import { deferred, sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/session/controller.js'

const target = { storyId: 'a:b', variantId: 'c', frameKey: 'frame' }

/** Reuse SDK transport fixture with real source connection, selection and primary lifecycle. */
async function readyFrame(variantId = target.variantId, fixture = sourceFixture()) {
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: target.storyId, variantId })
  await session.mount({} as HTMLElement, { surface: 'preview' }).ready
  return { session, fixture }
}

describe('owning frame variant source', () => {
  it('uses passive source generator while canonical selection stays unchanged', async () => {
    const canonical = await readyFrame()
    const passive = await readyFrame('other')
    const copy = vi.fn(async (_text: string) => {})
    const actions = createFrameActions({ session: canonical.session, frameSession: () => passive.session, copy, link: () => '', reveal: vi.fn() })
    try {
      await actions.run(actions.entries.get('save-props')!, { ...target, variantId: 'other' })
      expect(copy).toHaveBeenCalledWith('<Variant title="Two">\n  source\n</Variant>')
      expect(passive.fixture.request).toHaveBeenCalledWith('source.get', { storyId: target.storyId, variantId: 'other', mode: 'dynamic' }, expect.objectContaining({ runtimeId: 'document-1' }))
      expect(canonical.fixture.request.mock.calls.some(([command]) => command === 'source.get' || command === 'state.get')).toBe(false)
      expect(canonical.session.getSnapshot().selection?.variantId).toBe('c')
    }
    finally {
      await passive.session.dispose()
      await canonical.session.dispose()
    }
  })

  it.each(['document', 'source', 'selection', 'replacement'] as const)('drops late result and feedback after owning %s changes', async (change) => {
    const original = await readyFrame()
    const successor = await readyFrame()
    let owner = original.session
    const reply = await original.fixture.request('source.get', { storyId: target.storyId, variantId: target.variantId, mode: 'dynamic' })
    const pending = deferred<typeof reply>()
    original.fixture.request.mockClear()
    original.fixture.request.mockImplementationOnce(async () => pending.promise)
    const copy = vi.fn(async (_text: string) => {})
    const error = vi.fn()
    const actions = createFrameActions({ session: original.session, frameSession: () => owner, copy, error, link: () => '', reveal: vi.fn() })
    try {
      const running = actions.run(actions.entries.get('save-props')!, target)
      await vi.waitFor(() => expect(original.fixture.request).toHaveBeenCalledWith('source.get', expect.anything(), expect.anything()))
      if (change === 'document') {
        original.fixture.reload()
      }
      else if (change === 'source') {
        original.fixture.descriptor.revision = 'next-publication'
        original.fixture.emitCatalog()
      }
      else if (change === 'selection') {
        await original.session.selection.select({ storyId: target.storyId, variantId: 'other' })
      }
      else {
        owner = successor.session
      }
      pending.resolve(reply)
      await running
      expect(copy).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(actions.manualCopy.value).toBeNull()
    }
    finally {
      await successor.session.dispose()
      await original.session.dispose()
    }
  })

  it('keeps unavailable frame disabled without selecting a different canonical target', async () => {
    const canonical = await readyFrame()
    const copy = vi.fn(async (_text: string) => {})
    const actions = createFrameActions({ session: canonical.session, frameSession: () => null, copy, link: () => '', reveal: vi.fn() })
    try {
      const action = actions.entries.get('save-props')!
      expect(actions.list({ ...target, variantId: 'other' })).toContain(action)
      expect(action.disabled?.(target)).toBe('Wait for preview to finish loading.')
      await actions.run(action, { ...target, variantId: 'other' })
      expect(canonical.session.getSnapshot().selection?.variantId).toBe('c')
      expect(copy).not.toHaveBeenCalled()
    }
    finally { await canonical.session.dispose() }
  })

  it('hides proven unsupported generator only for its current owner, allowing fresh document retry', async () => {
    const original = await readyFrame()
    const copy = vi.fn(async (_text: string) => {})
    const actions = createFrameActions({ session: original.session, copy, link: () => '', reveal: vi.fn() })
    const action = actions.entries.get('save-props')!
    try {
      expect(actions.list(target)).toContain(action)
      original.fixture.request.mockRejectedValueOnce(new HistoireSdkError('SOURCE_UNAVAILABLE', 'Dynamic source unavailable'))
      await actions.run(action, target)
      expect(actions.list(target)).not.toContain(action)
      expect(copy).not.toHaveBeenCalled()
      original.fixture.reload()
      original.fixture.ready()
      expect(actions.list(target)).toContain(action)
      await actions.run(action, target)
      expect(copy).toHaveBeenCalledOnce()
      expect(original.fixture.request.mock.calls.some(([command]) => command === 'state.get')).toBe(false)
    }
    finally { await original.session.dispose() }
  })

  it('hides source engine which explicitly advertises no dynamic generator', async () => {
    const fixture = sourceFixture()
    fixture.descriptor.capabilities.dynamicSource.available = false
    const original = await readyFrame(target.variantId, fixture)
    const actions = createFrameActions({ session: original.session, link: () => '', reveal: vi.fn() })
    try {
      expect(actions.list(target).map(action => action.id)).not.toContain('save-props')
    }
    finally { await original.session.dispose() }
  })

  it('rejects generated source attributed to another variant within same story', async () => {
    const original = await readyFrame()
    const reply = await original.fixture.request('source.get', { ...target, mode: 'dynamic' })
    original.fixture.request.mockResolvedValueOnce({ ...reply, variantId: 'other' })
    const copy = vi.fn(async (_text: string) => {})
    const error = vi.fn()
    const actions = createFrameActions({ session: original.session, copy, error, link: () => '', reveal: vi.fn() })
    try {
      await actions.run(actions.entries.get('save-props')!, target)
      expect(copy).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'RUNTIME_CHANGED' }))
    }
    finally { await original.session.dispose() }
  })

  it('suppresses manual clipboard fallback when permission failure arrives after frame retirement', async () => {
    const original = await readyFrame()
    const successor = await readyFrame()
    let owner = original.session
    const pending = deferred()
    const copy = vi.fn(async (_text: string) => pending.promise)
    const actions = createFrameActions({ session: original.session, frameSession: () => owner, copy, link: () => '', reveal: vi.fn() })
    try {
      const running = actions.run(actions.entries.get('save-props')!, target)
      await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce())
      owner = successor.session
      pending.reject(new Error('Clipboard denied'))
      await running
      expect(actions.manualCopy.value).toBeNull()
    }
    finally {
      await successor.session.dispose()
      await original.session.dispose()
    }
  })
})
