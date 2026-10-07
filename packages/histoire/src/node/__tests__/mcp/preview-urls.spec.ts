import type { Story, Variant } from '../../../../../histoire-app/src/app/types'
import { getSandboxRelativeUrl, resolveStoryRouteId, STORY_ROUTE_PATH } from '@histoire/shared'
import { createMemoryHistory, createRouter } from '@histoire/vendors/vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewUrls } from '../../mcp/project/preview-urls.js'

describe('exact Histoire preview URLs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

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

  it.each(['/', '/nested/book/'])('uses deployment base %s without browser router initialization', async (base) => {
    vi.stubEnv('BASE_URL', base)
    // Node has no browser history or document. Importing the wrapper here proves
    // URL construction does not require the old global browser router.
    const { getSandboxUrl } = await import('../../../../../histoire-app/src/app/util/sandbox')
    for (const storyId of ['normal', 'same:part/雪? #%', '.', '..', '%2E']) {
      const story = { id: storyId } as Story
      const variant = { id: 'default:part/雪? #%' } as Variant
      const relative = getSandboxUrl(story, variant)
      expect(relative).toBe(getSandboxRelativeUrl({ base, storyId, variantId: variant.id }))
      const sandbox = new URL(relative, 'https://example.com')
      expect(sandbox.pathname).toBe(`${base}__sandbox.html`)
      expect(sandbox.searchParams.get('storyId')).toBe(storyId)
      expect(sandbox.searchParams.get('variantId')).toBe(variant.id)
      expect(sandbox.searchParams.has('grid')).toBe(false)

      const grid = new URL(getSandboxUrl(story), 'https://example.com')
      expect(grid.pathname).toBe(`${base}__sandbox.html`)
      expect(grid.searchParams.get('storyId')).toBe(storyId)
      expect(grid.searchParams.get('grid')).toBe('true')
      expect(grid.searchParams.has('variantId')).toBe(false)
    }
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
