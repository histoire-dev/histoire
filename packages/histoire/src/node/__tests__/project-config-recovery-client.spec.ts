import { describe, expect, it, vi } from 'vitest'
import { createProjectConfigStore } from '../../../../histoire-app/src/app/stores/project-config.js'
import { memoryStorage } from './utils/settings-storage.js'

/** Real client store with a private callback transport, not a global socket. */
function client(storage = memoryStorage()) {
  let receive: (value: any) => void = () => {}
  const send = vi.fn(() => true)
  const store = createProjectConfigStore({
    send,
    subscribe(callback) {
      receive = callback
      return () => {}
    },
  }, { storage, key: 'owned-source' })
  return { store, storage, send, receive: (value: unknown) => receive(value) }
}

describe('project config save receipt client', () => {
  it('recovers pending capability after remount and retires exact submitted value once', () => {
    const first = client()
    first.store.save([{ path: 'responsivePresets', value: [{ label: 'Phone', width: 390 }] }])
    const requestId = first.send.mock.lastCall?.[1].requestId
    expect(requestId).toEqual(expect.any(String))
    first.store.close()
    const next = client(first.storage)
    next.store.read(['responsivePresets'])
    expect(next.send.mock.lastCall).toEqual(['histoire:ui:config-read', { paths: ['responsivePresets'], requestId }])
    next.receive({ requestId, paths: {}, completion: 'pending' })
    expect(next.store.pending.value).toBe(true)
    expect(next.store.consumeSaved('responsivePresets', [{ label: 'Phone', width: 390 }])).toBe(false)
    next.receive({ requestId, paths: {}, completion: 'saved', saved: ['responsivePresets'] })
    expect(next.store.consumeSaved('responsivePresets', [{ width: 390, label: 'Phone' }])).toBe(true)
    expect(next.store.consumeSaved('responsivePresets', [{ label: 'Phone', width: 390 }])).toBe(false)
    expect(next.storage.getItem('owned-source')).toBeNull()
    next.store.close()
  })

  it('rejects unrelated replies and keeps newer local edits after verified save', () => {
    const { store, send, receive } = client()
    store.save([{ path: 'backgroundPresets', value: [{ label: 'Paper', color: '#fff' }] }])
    const requestId = send.mock.lastCall?.[1].requestId
    receive({ requestId: 'foreign', paths: {}, completion: 'saved', saved: ['backgroundPresets'] })
    expect(store.pending.value).toBe(true)
    expect(store.consumeSaved('backgroundPresets', [{ label: 'Paper', color: '#fff' }])).toBe(false)
    receive({ requestId, paths: {}, completion: 'saved', saved: ['backgroundPresets'] })
    expect(store.consumeSaved('backgroundPresets', [{ label: 'Paper', color: '#eee' }])).toBe(false)
    expect(store.consumeSaved('backgroundPresets', [{ label: 'Paper', color: '#fff' }])).toBe(false)
    store.close()
  })

  it('rechecks pending save after reconnect snapshot without replaying write', () => {
    const { store, send, receive } = client()
    store.save([{ path: 'ui.defaultArrange', value: 'list' }])
    const requestId = send.mock.lastCall?.[1].requestId
    receive({ paths: {} })
    expect(send.mock.lastCall).toEqual(['histoire:ui:config-read', { paths: ['ui.defaultArrange'], requestId }])
    expect(send.mock.calls.filter(call => call[0] === 'histoire:ui:config-save')).toHaveLength(1)
    receive({ requestId, paths: {}, completion: 'failed', error: 'Config conflict: file changed on disk.' })
    expect(store.pending.value).toBe(true)
    receive({ paths: { 'ui.defaultArrange': { status: 'editable' } }, hash: 'new' })
    expect(store.pending.value).toBe(false)
    expect(store.consumeSaved('ui.defaultArrange', 'list')).toBe(false)
    store.close()
  })

  it('uses secure UUID bytes on LAN and rejects oversized pending values before sending', () => {
    const original = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) })
    const first = client()
    try {
      first.store.save([{ path: 'ui.defaultArrange', value: 'list' }])
      expect(first.send.mock.lastCall?.[1].requestId).toMatch(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
    }
    finally {
      first.store.close()
      vi.unstubAllGlobals()
    }
    const next = client()
    next.store.save([{ path: 'backgroundPresets', value: 'x'.repeat(64 * 1024) }])
    expect(next.send).not.toHaveBeenCalled()
    expect(next.storage.getItem('owned-source')).toBeNull()
    expect(next.store.pending.value).toBe(false)
    expect(next.store.state.value.error).toBe('Could not send project config save.')
    next.store.close()
  })

  it('leaves failed save usable after config deletion and an empty status reread', () => {
    const { store, send, receive } = client()
    store.save([{ path: 'ui.defaultArrange', value: 'list' }])
    const requestId = send.mock.lastCall?.[1].requestId
    receive({ requestId, paths: {}, completion: 'failed', error: 'Config conflict: file changed on disk.' })
    receive({ file: 'histoire.config.ts', paths: {} })
    expect(store.pending.value).toBe(false)
    store.save([{ path: 'ui.defaultArrange', value: 'grid' }])
    expect(send.mock.calls.filter(call => call[0] === 'histoire:ui:config-save')).toHaveLength(2)
    store.close()
  })

  it('retains acknowledged receipts across another Settings save and remount', () => {
    const first = client()
    const viewport = [{ label: 'Phone', width: 390 }]
    first.store.save([{ path: 'responsivePresets', value: viewport }])
    const viewportRequestId = first.send.mock.lastCall?.[1].requestId
    first.receive({ requestId: viewportRequestId, completion: 'saved', saved: ['responsivePresets'], paths: {} })
    first.store.save([{ path: 'ui.defaultArrange', value: 'list' }])
    const arrangementRequestId = first.send.mock.lastCall?.[1].requestId
    first.receive({ requestId: arrangementRequestId, completion: 'saved', saved: ['ui.defaultArrange'], paths: {} })
    first.store.close()

    const restored = client(first.storage)
    expect(restored.store.consumeSaved('responsivePresets', [{ width: 390, label: 'Phone' }])).toBe(true)
    expect(restored.store.consumeSaved('ui.defaultArrange', 'list')).toBe(true)
    expect(restored.storage.getItem('owned-source')).toBeNull()
    restored.store.close()
  })

  it('does not retire a newer override from an unconsumed receipt', () => {
    const { store, receive, send } = client()
    store.save([{ path: 'responsivePresets', value: [{ label: 'Phone', width: 390 }] }])
    const requestId = send.mock.lastCall?.[1].requestId
    receive({ requestId, completion: 'saved', saved: ['responsivePresets'], paths: {} })
    expect(store.consumeSaved('responsivePresets', [{ label: 'Phone', width: 400 }])).toBe(false)
    expect(store.consumeSaved('responsivePresets', [{ label: 'Phone', width: 390 }])).toBe(false)
    store.close()
  })
})
