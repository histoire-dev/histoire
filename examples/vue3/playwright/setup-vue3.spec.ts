import { expect, test } from '@playwright/test'

test.describe('setup app (vue3)', () => {
  test('honors the global setup', async ({ page }) => {
    await page.goto('/story/src-components-storysetup-story-vue?variantId=global')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.getByText('42')).toBeVisible()
  })

  test('honors the local setup', async ({ page }) => {
    await page.goto('/story/src-components-storysetup-story-vue?variantId=local')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.getByText('meow')).toBeVisible()
  })

  test('renders globally registered components', async ({ page }) => {
    await page.goto('/story/src-components-storysetup-story-vue?variantId=global-component')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.getByText('Global component')).toBeVisible()
  })
})
