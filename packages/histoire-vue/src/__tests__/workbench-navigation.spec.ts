import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { createStandaloneNavigation } from '../../../histoire-app/src/app/standalone/navigation.js'
import { createStandaloneSelection } from '../../../histoire-app/src/app/standalone/selection.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

describe('workbench URL adapter', () => {
  it.each([true, false])('validates settings sections and dev capabilities (dev=%s)', async (dev) => {
    const fixture = sourceFixture()
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const navigation = createStandaloneNavigation(selection, { base: '/', mode: 'history', error: vi.fn(), dev })
    try {
      await navigation.router.push('/settings/unknown')
      expect(navigation.router.currentRoute.value.params.section).toBe('appearance')
      await navigation.router.push('/settings/agents')
      expect(navigation.router.currentRoute.value.params.section).toBe(dev ? 'agents' : 'appearance')
    }
    finally {
      navigation.close()
      selection.close()
      await core.dispose()
    }
  })

  it('preserves matrix URL and inspector tab when selecting another variant in same story', async () => {
    const fixture = sourceFixture()
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const navigation = createStandaloneNavigation(selection, { base: '/', mode: 'history', error: vi.fn() })
    try {
      await navigation.router.push('/story/a:b?variantId=c&arrange=matrix&rows=size&cols=disabled&tab=events')
      await navigation.synchronize()
      await selection.session.selection.select({ storyId: 'a:b', variantId: 'other' })
      expect(navigation.router.currentRoute.value.query).toEqual({ variantId: 'other', arrange: 'matrix', rows: 'size', cols: 'disabled', tab: 'events' })
    }
    finally {
      navigation.close()
      selection.close()
      await core.dispose()
    }
  })
})
