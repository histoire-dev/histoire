import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

/** Docs-only source exercises relative story links and typed syntax fences. */
const guide = '---\nid: guide\ntitle: Guide\n---\n# Grammar docs\n\n```ts\nconst count: number = 1\n```\n\n[Open book](./Book.story.vue?variantId=one&tab=docs#detail)'
/** Independent inline docs require a grammar not used during initial discovery. */
const inline = '<template><Story id="inline" title="Inline"><Variant id="one">Inline content</Variant></Story></template><docs lang="md"># Inline documentation\n\n```ruby\nputs "inline code"\n```\n</docs>'

describe('markdown startup browser acceptance', () => {
  it.each(['dev', 'static'] as const)('renders fenced docs and relative links in a real %s book', async (mode) => {
    const fixture = await createEmbedBridgeFixture({
      mode,
      config: `routerMode: '${mode === 'static' ? 'hash' : 'history'}',`,
      embedding: false,
      story: '<template><Story id="book" title="Book"><Variant id="one">Book content</Variant></Story></template>',
      files: {
        'Guide.story.md': guide,
        'Book.story.md': '# Sibling documentation\n\n```vue\n<template><button>Safe code</button></template>\n```\n\n<h2 id="detail">Detail</h2>',
        'Inline.story.vue': inline,
      },
    })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    /** Static hosting uses hash routes without server-side history fallback. */
    function route(path: string) {
      return `${fixture.bookUrl}${mode === 'static' ? '#' : ''}${path}`
    }
    try {
      await page.goto(route('story/guide?tab=docs'))
      await page.getByRole('heading', { name: 'Grammar docs', exact: true }).waitFor()
      expect(await page.locator('code').allTextContents()).toContain('const count: number = 1\n')
      await page.getByRole('link', { name: 'Open book', exact: true }).click()
      await page.getByRole('heading', { name: 'Sibling documentation', exact: true }).waitFor()
      const location = new URL(page.url())
      const currentRoute = mode === 'static' ? new URL(location.hash.slice(1), location.origin) : location
      expect(currentRoute.pathname).toContain('/story/book')
      expect(await page.locator('code').allTextContents()).toContain('<template><button>Safe code</button></template>\n')
      await page.goto(route('story/inline?variantId=one&tab=docs'))
      await page.getByRole('heading', { name: 'Inline documentation', exact: true }).waitFor()
      expect(await page.locator('code').allTextContents()).toContain('puts "inline code"\n')
      if (mode === 'dev') {
        await page.goto(route('story/guide?tab=docs'))
        await page.getByRole('heading', { name: 'Grammar docs', exact: true }).waitFor()
        await writeFile(join(fixture.root, 'Guide.story.md'), '---\nid: guide\ntitle: Guide\n---\n# Updated grammar docs\n\n```python\nprint("hot update")\n```')
        await page.getByRole('heading', { name: 'Updated grammar docs', exact: true }).waitFor()
        expect(await page.locator('code').allTextContents()).toContain('print("hot update")\n')
      }
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  }, 120_000)
})
