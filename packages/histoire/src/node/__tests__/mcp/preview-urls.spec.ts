import { getSandboxRelativeUrl, resolveStoryRouteId, STORY_ROUTE_PATH } from '@histoire/shared'
import { createMemoryHistory, createRouter } from '@histoire/vendors/vue-router'
import { describe, expect, it, vi } from 'vitest'
import { createPreviewUrls } from '../../mcp/project/preview-urls.js'

describe('exact Histoire preview URLs', () => {
  it.each(['hash', 'history'] as const)('preserves base and hostile identity in %s router', (routerMode) => {
    const router = createRouter({ history: createMemoryHistory('/book/'), routes: [{ path: STORY_ROUTE_PATH, name: 'story', component: {} }] })
    for (const storyId of ['normal', '雪/a? #%', '.', '..', '%2E']) {
      const variantId = 'shared/雪? #%'
      const urls = createPreviewUrls({ origin: 'http://localhost:7482/book/', base: '/book/', routerMode, storyId, variantId })
      const browserUrl = new URL(urls.storyUrl)
      const location = routerMode === 'hash' ? browserUrl.hash.slice(1) : `${browserUrl.pathname.slice('/book'.length)}${browserUrl.search}`
      const route = router.resolve(location)
      expect(route.name).toBe('story')
      expect(resolveStoryRouteId(route.params, route.query)).toBe(storyId)
      expect(route.query.variantId).toBe(variantId)
      expect(browserUrl.origin).toBe('http://localhost:7482')
      const sandbox = new URL(urls.sandboxUrl)
      expect(sandbox.pathname).toBe('/book/__sandbox.html')
      expect(sandbox.searchParams.get('storyId')).toBe(storyId)
      expect(sandbox.searchParams.get('variantId')).toBe(variantId)
      expect(sandbox.searchParams.has('grid')).toBe(false)
    }
  })

  it('agrees with app sandbox wrapper and retains omitted-variant grid behavior', async () => {
    vi.doMock('../../../../../histoire-app/src/app/router', () => ({ base: '/book/' }))
    try {
      const { getSandboxUrl } = await import('../../../../../histoire-app/src/app/util/sandbox')
      const story = { id: 'same/? #%' } as any
      const variant = { id: 'default/雪' } as any
      expect(getSandboxUrl(story, variant)).toBe(getSandboxRelativeUrl({ base: '/book/', storyId: story.id, variantId: variant.id }))
      const grid = new URL(getSandboxUrl(story), 'https://example.com')
      expect(grid.searchParams.get('grid')).toBe('true')
      expect(grid.searchParams.has('variantId')).toBe(false)
    }
    finally { vi.doUnmock('../../../../../histoire-app/src/app/router') }
  })

  it('resolves query identity only for pathless dot IDs and gives normal params priority', () => {
    expect(resolveStoryRouteId({}, { storyId: '..' })).toBe('..')
    expect(resolveStoryRouteId({ storyId: 'selected' }, { storyId: '..' })).toBe('selected')
    expect(resolveStoryRouteId({}, { storyId: 'foreign' })).toBeUndefined()
    expect(resolveStoryRouteId({}, { storyId: ['..', '.'] })).toBeUndefined()
  })

  it('rejects credential-bearing and non-HTTP origins', () => {
    for (const origin of ['https://token@example.com', 'file:///private/project']) {
      expect(() => createPreviewUrls({ origin, base: '/', routerMode: 'history', storyId: 'story', variantId: 'variant' })).toThrow(/origin/)
    }
  })

  it('rejects bases that could select another origin or inject URL fields', () => {
    for (const base of ['//foreign.example/', 'https://foreign.example/', '/book?foreign/', '/book\\foreign/']) {
      expect(() => createPreviewUrls({ origin: 'https://book.example', base, routerMode: 'history', storyId: 'story', variantId: 'variant' })).toThrow('same-origin absolute path')
    }
  })
})
