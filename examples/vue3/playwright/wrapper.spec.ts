import { expect, test } from '@playwright/test'

test.describe('wrapper', () => {
  test('applies the global wrapper to a basic story', async ({ page }) => {
    await page.goto('/story/src-components-meow-story-vue?variantId=src-components-meow-story-vue-0')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.locator('.histoire-generic-render-story .global-wrapper')).toHaveCSS('padding', '4px')
  })

  test('respects story-level wrapper meta', async ({ page }) => {
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')

    await page.goto('/story/src-components-wrappermetaonstory-story-vue?variantId=src-components-wrappermetaonstory-story-vue-0')
    await expect(iframe.getByText('🙀')).toBeVisible()
    await expect(iframe.locator('.histoire-generic-render-story .global-wrapper')).not.toHaveCSS('padding', '4px')

    await page.goto('/story/src-components-wrappermetaonstory-story-vue?variantId=src-components-wrappermetaonstory-story-vue-1')
    await expect(iframe.getByText('😼')).toBeVisible()
    await expect(iframe.locator('.histoire-generic-render-story .global-wrapper')).not.toHaveCSS('padding', '4px')
  })

  test('respects variant-level wrapper meta', async ({ page }) => {
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')

    await page.goto('/story/src-components-wrappermetaonvariant-story-vue?variantId=src-components-wrappermetaonvariant-story-vue-0')
    await expect(iframe.getByText('🙀')).toBeVisible()
    await expect(iframe.locator('.histoire-generic-render-story .global-wrapper')).toHaveCSS('padding', '4px')

    await page.goto('/story/src-components-wrappermetaonvariant-story-vue?variantId=src-components-wrappermetaonvariant-story-vue-1')
    await expect(iframe.getByText('😼')).toBeVisible()
    await expect(iframe.locator('.histoire-generic-render-story .global-wrapper')).not.toHaveCSS('padding', '4px')
  })
})
