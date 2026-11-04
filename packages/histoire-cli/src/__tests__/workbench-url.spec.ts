import { resolveStoryRouteId, STORY_ROUTE_PATH } from '@histoire/protocol'
import { createMemoryHistory, createRouter } from '@histoire/vendors/vue-router'
import { describe, expect, it } from 'vitest'
import { createStoryUrl } from '../workbench-url.js'

describe('story-only workbench URL', () => {
  it.each(['hash', 'history'] as const)('resolves the story route in %s mode without inventing a variant', (routerMode) => {
    const router = createRouter({ history: createMemoryHistory('/book/'), routes: [{ path: STORY_ROUTE_PATH, name: 'story', component: {} }] })
    for (const storyId of ['normal', '雪/a? #%', '.', '..', '%2E']) {
      const url = new URL(createStoryUrl({ origin: 'http://localhost:7482', base: '/book/', routerMode, storyId }))
      const route = router.resolve(routerMode === 'hash' ? url.hash.slice(1) : `${url.pathname.slice('/book'.length)}${url.search}`)
      expect(route.name).toBe('story')
      expect(resolveStoryRouteId(route.params, route.query)).toBe(storyId)
      expect(route.query.variantId).toBeUndefined()
    }
  })
})
