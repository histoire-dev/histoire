import { expect, test } from '@playwright/test'

test.describe('markdown links', () => {
  test('keeps internal anchor links bare (no target attr)', async ({ page }) => {
    await page.goto('/story/src-components-markdownlinks-story-vue?variantId=_default')
    const link = page.locator('#link-to-welcome')
    await expect(link).toHaveAttribute('href', '#welcome')
    await expect(link).not.toHaveAttribute('target', /.*/)
  })

  test('opens external links in a new tab', async ({ page }) => {
    await page.goto('/story/src-components-markdownlinks-story-vue?variantId=_default')
    const link = page.locator('#link-to-history')
    await expect(link).toHaveAttribute('href', 'https://histoire.dev/')
    await expect(link).toHaveAttribute('target', '_blank')
  })
})
