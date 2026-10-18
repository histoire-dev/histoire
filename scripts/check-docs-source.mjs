import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Preserve an already expanded drawer when navigating between stories. */
export async function expandSource(page) {
  const button = page.getByRole('button', { name: 'Expand source', exact: true })
  if (await button.count()) await button.click()
}

/** Plain-text fallback must not satisfy successful syntax-highlighting checks. */
async function expectHighlightedSource(page, expect, text) {
  const source = page.getByRole('region', { name: 'Histoire source', exact: true })
  await expect(source.locator('pre code')).toContainText(text)
  await expect.poll(() => source.locator('code > span > span').count()).toBeGreaterThan(1)
}

/** Cold static loads exercise real Shiki chunks and persisted source preferences. */
export async function checkSourcePane(browser, origin, expect) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('response', (response) => {
        if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
      })
      const storyUrl = `${origin}/demo/#/story/src-components-codegen-story-vue?variantId=html`
      await page.goto(storyUrl)
      await expect(page.getByRole('button', { name: 'Expand source', exact: true })).toHaveAttribute('aria-expanded', 'false')
      await expandSource(page)
      await expectHighlightedSource(page, expect, '<h1>Title</h1>')

      await page.getByRole('treeitem', { name: 'click event', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Collapse source', exact: true })).toHaveAttribute('aria-expanded', 'true')
      await expectHighlightedSource(page, expect, '@click="onClick($event)"')
      const generated = await page.getByRole('region', { name: 'Histoire source', exact: true }).locator('code').textContent()
      await page.getByRole('button', { name: 'Story file', exact: true }).click()
      await expectHighlightedSource(page, expect, '<script lang="ts" setup>')
      await page.reload()
      await expectHighlightedSource(page, expect, '@click="onClick($event)"')
      await expect(page.getByRole('region', { name: 'Histoire source', exact: true }).locator('code')).toHaveText(generated)

      await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
      await page.getByRole('button', { name: 'Show inspector', exact: true }).click()
      await expectHighlightedSource(page, expect, '@click="onClick($event)"')
      await page.getByRole('button', { name: 'Home', exact: true }).click()
      await page.getByRole('treeitem', { name: 'click event', exact: true }).click()
      await expectHighlightedSource(page, expect, '@click="onClick($event)"')
      await page.getByRole('treeitem', { name: 'MarkdownFile', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Histoire source', exact: true })).toHaveCount(0)
      await page.getByRole('treeitem', { name: 'Code gen', exact: true }).click()
      await page.getByRole('treeitem', { name: 'click event', exact: true }).click()
      await expectHighlightedSource(page, expect, '@click="onClick($event)"')

      const directory = process.env.HISTOIRE_SOURCE_SCREENSHOTS
      if (directory) {
        await page.getByRole('button', { name: 'Single variant', exact: true }).click()
        const canvas = page.frameLocator('iframe[src*="variantId=click-events"]:not([src*="controls=true"])')
        await expect(canvas.getByRole('button', { name: 'Click me', exact: true })).toHaveCount(3)
        await expect(page.getByRole('textbox', { name: 'value', exact: true })).toHaveValue('Foo')
        await mkdir(directory, { recursive: true })
        await page.screenshot({ path: join(directory, `source-${theme}.png`), animations: 'disabled' })
      }

      // Both header controls update the same saved preference.
      await page.getByRole('button', { name: 'Source', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Expand source', exact: true })).toHaveAttribute('aria-expanded', 'false')
      await page.getByRole('treeitem', { name: 'html', exact: true }).click()
      await page.reload()
      await expect(page.getByRole('button', { name: 'Expand source', exact: true })).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByRole('region', { name: 'Histoire source', exact: true })).toHaveCount(0)
      await expandSource(page)
      await expectHighlightedSource(page, expect, '<h1>Title</h1>')
      // A different story must inherit the same preference as a different variant.
      await page.goto(`${origin}/demo/#/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0`)
      await expectHighlightedSource(page, expect, 'Hello world!')
      await page.getByRole('button', { name: 'Collapse source', exact: true }).click()
      await page.goto(storyUrl)
      await expect(page.getByRole('button', { name: 'Expand source', exact: true })).toHaveAttribute('aria-expanded', 'false')
      assert.deepEqual(errors, [], `${theme} source must load without browser errors or missing assets`)
    }
    finally {
      await context.close()
    }
  }
}
