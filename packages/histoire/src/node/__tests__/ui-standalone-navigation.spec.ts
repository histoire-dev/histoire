// @vitest-environment jsdom
import { resolveStoryRouteId } from '@histoire/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/session/controller.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createStandaloneNavigation } from '../../../../histoire-app/src/app/standalone/navigation.js'
import { createStandaloneSelection } from '../../../../histoire-app/src/app/standalone/selection.js'

const resources: (() => Promise<void> | void)[] = []

afterEach(async () => {
  await Promise.all(resources.splice(0).reverse().map(close => close()))
  window.history.replaceState({}, '', '/')
})

describe('standalone navigation restoration', () => {
  it('restores the exact selected target from Settings without replaying selection', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: window.location.href }, fixture.adapters)
    await session.connect()
    const target = { storyId: 'a:b', variantId: 'c' }
    await session.selection.select(target)
    const select = vi.spyOn(session.selection, 'select')
    const selection = createStandaloneSelection(session)
    const navigation = createStandaloneNavigation(selection, { base: '/', mode: 'history', error: vi.fn() })
    resources.push(navigation.close, selection.close, () => session.dispose())

    await navigation.router.push({ name: 'settings', params: { section: 'general' } })
    select.mockClear()
    await navigation.restore(target)
    await navigation.synchronize()

    const route = navigation.router.currentRoute.value
    expect(route.name).toBe('story')
    expect(resolveStoryRouteId(route.params, route.query)).toBe(target.storyId)
    expect(route.query.variantId).toBe(target.variantId)
    expect(session.getSnapshot().selection).toEqual(target)
    expect(select).not.toHaveBeenCalled()
  })
})
