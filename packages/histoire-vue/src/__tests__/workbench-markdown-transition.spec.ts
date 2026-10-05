import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it } from 'vitest'
import { createWorkbenchMarkdownTransition } from '../../../histoire-app/src/app/standalone/markdown-transition.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

describe('standalone Markdown transition ownership', () => {
  it.each(['target', 'source', 'close'])('retires delayed page switch after %s replacement', async (replacement) => {
    const fixture = sourceFixture()
    const pending = deferred<unknown>()
    const dispatch = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => command === 'selection.select' && payload.storyId === 'docs' ? pending.promise : dispatch(command, payload))
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount(document.createElement('div'), { surface: 'preview' })
    await primary.ready
    const markdown = createWorkbenchMarkdownTransition(session)
    const operation = session.selection.select({ storyId: 'docs', variantId: null })
    try {
      expect(markdown.visible.value).toBe(false)
      if (replacement === 'target') {
        await session.selection.select({ storyId: 'a:b', variantId: 'c' })
      }
      else if (replacement === 'source') {
        fixture.descriptor.revision = 'revision-2'
        fixture.descriptor.catalog = { ...fixture.descriptor.catalog, stories: fixture.descriptor.catalog.stories.filter(story => story.id !== 'docs') }
        fixture.emitCatalog()
      }
      else {
        markdown.close()
      }
      pending.resolve(undefined)
      await operation.catch(() => {})
      await Promise.resolve()
      expect(markdown.visible.value).toBe(false)
    }
    finally {
      markdown.close()
      await primary.unmount()
      await session.dispose()
    }
  })
})
