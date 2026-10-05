import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const story = '<template><Story id="normal" title="Normal story"><Variant id="one"><button>First preview</button></Variant><Variant id="two"><button>Second preview</button></Variant></Story></template>'
const documentation = `# Story documentation

<a href="story/normal?variantId&amp;tab=docs#part" data-route="true">Data only</a>

<a href="story/normal?variantId=two&amp;tab=docs#part" data-route="true">Second documentation</a>

<h2 id="part">Details</h2>`

describe('standalone documentation navigation intent', () => {
  it.each([{ mode: 'dev', routerMode: 'history' }, { mode: 'static', routerMode: 'hash' }] as const)('preserves explicit null and docs suffix in $routerMode $mode book', async ({ mode, routerMode }) => {
    const fixture = await createEmbedBridgeFixture({ mode, embedding: false, story, files: { 'Book.story.md': documentation }, config: `routerMode:'${routerMode}',` })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    /** Read source route without conflating hash router prefix with docs anchor. */
    function currentRoute(): URL {
      const url = new URL(page.url())
      return routerMode === 'hash' ? new URL(url.hash.slice(1), url.origin) : url
    }
    /** Canvas replicas are independent; inspect only selected canonical preview. */
    async function preview() {
      const selected = page.locator('iframe[data-test-id="preview-iframe"]')
      if (!await selected.count()) return null
      const iframe = await selected.elementHandle()
      return iframe?.contentFrame()
    }
    try {
      await page.goto(`${fixture.bookUrl}${routerMode === 'hash' ? '#' : ''}story/normal?variantId=one&tab=docs`)
      await page.getByRole('link', { name: 'Data only', exact: true }).waitFor()
      await page.getByRole('link', { name: 'Data only', exact: true }).click()
      await expect.poll(() => currentRoute().searchParams.get('variantId'), { timeout: 15_000 }).toBe('')
      expect(currentRoute().searchParams.get('tab')).toBe('docs')
      expect(currentRoute().hash).toBe('#part')
      await expect.poll(() => page.locator('iframe[data-test-id="preview-iframe"]').count(), { timeout: 15_000 }).toBe(0)
      expect(await page.getByRole('tab', { name: 'Docs', exact: true }).getAttribute('aria-selected')).toBe('true')

      await page.getByRole('link', { name: 'Second documentation', exact: true }).click()
      await expect.poll(async () => (await preview())?.getByRole('button', { name: 'Second preview', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(currentRoute().searchParams.get('variantId')).toBe('two')
      expect(currentRoute().searchParams.get('tab')).toBe('docs')
      expect(currentRoute().hash).toBe('#part')
      expect(await page.getByRole('tab', { name: 'Docs', exact: true }).getAttribute('aria-selected')).toBe('true')
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
