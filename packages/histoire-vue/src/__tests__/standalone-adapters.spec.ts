import { createHistoireSessionWithAdapters, getHistoireDocsPolicy } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { restoreStandalonePreferences } from '../../../histoire-app/src/app/standalone/preferences.js'
import { createStandaloneSelection } from '../../../histoire-app/src/app/standalone/selection.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

describe('explicit standalone policies', () => {
  it('publishes accepted URL before runtime ACK so document reload retains explicit choice', async () => {
    const fixture = sourceFixture()
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await core.connect()
    await core.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = core.mount(document.createElement('div'), { surface: 'preview' })
    await primary.ready
    const local = createStandaloneSelection(core)
    const navigate = vi.fn(async () => {})
    local.setNavigate(navigate)
    const accepted = deferred<void>()
    const dispatch = fixture.request.getMockImplementation()!
    fixture.request.mockImplementationOnce(async (command, payload) => {
      await accepted.promise
      return dispatch(command, payload)
    })
    try {
      const selecting = local.session.selection.select({ storyId: 'a', variantId: 'b:c' })
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ storyId: 'a', variantId: 'b:c' }))
      accepted.resolve()
      await selecting
    }
    finally {
      accepted.resolve()
      local.close()
      await core.dispose()
    }
  })
  it('never acquires late persistence observer when startup closes during settings readiness', async () => {
    const fixture = sourceFixture()
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await core.connect()
    const settled = deferred<void>()
    const abort = new AbortController()
    const subscribe = vi.spyOn(core, 'subscribe')
    vi.spyOn(core.settings, 'update').mockImplementationOnce(() => settled.promise)
    const preferences = restoreStandalonePreferences(core, window, false, abort.signal)
    const rejected = expect(preferences).rejects.toThrow()
    abort.abort()
    settled.resolve()
    await rejected
    expect(subscribe).not.toHaveBeenCalled()
    await core.dispose()
  })
  it('preserves chooser and remembered variants without changing SDK defaults or parsing identity', async () => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories[0].variants.push({ ...fixture.descriptor.catalog.stories[0].variants[0], id: 'c:d', title: 'Second' })
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await core.connect()
    const local = createStandaloneSelection(core)
    const navigate = vi.fn(async () => {})
    local.setNavigate(navigate)
    try {
      expect(getHistoireDocsPolicy(core)).toBe('remote')
      expect(getHistoireDocsPolicy(local.session)).toBe('trusted-local')
      await local.session.selection.select({ storyId: 'a:b' })
      expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: null })
      await local.session.selection.select({ storyId: 'a:b', variantId: 'c:d' })
      await local.session.selection.select({ storyId: 'a', variantId: 'b:c' })
      await local.session.selection.select({ storyId: 'a:b' })
      expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c:d' })
      await expect(local.session.selection.select({ storyId: 'unknown' })).rejects.toMatchObject({ code: 'STORY_NOT_FOUND' })
      expect(navigate).toHaveBeenCalledTimes(4)
      local.close()
      expect(core.getSnapshot().status).toBe('ready')
    }
    finally {
      local.close()
      await core.dispose()
    }
  })

  it('reads legacy storage only through standalone adapter and detaches persistence on close', async () => {
    const fixture = sourceFixture()
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await core.connect()
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem('_histoire-sandbox-settings-v3', JSON.stringify({ responsiveWidth: 900, textDirection: 'rtl' }))
    window.sessionStorage.setItem('histoire-color-scheme', 'dark')
    expect(core.getSnapshot().settings.responsiveWidth).toBe(720)
    const close = await restoreStandalonePreferences(core, window, false)
    try {
      expect(core.getSnapshot().settings).toMatchObject({ responsiveWidth: 900, textDirection: 'rtl', colorScheme: 'dark' })
      await core.settings.update({ responsiveWidth: 640 })
      expect(JSON.parse(window.localStorage.getItem('_histoire-sandbox-settings-v3')!).responsiveWidth).toBe(640)
      close()
      await core.settings.update({ responsiveWidth: 500 })
      expect(JSON.parse(window.localStorage.getItem('_histoire-sandbox-settings-v3')!).responsiveWidth).toBe(640)
    }
    finally {
      close()
      await core.dispose()
      window.localStorage.clear()
      window.sessionStorage.clear()
    }
  })
})
