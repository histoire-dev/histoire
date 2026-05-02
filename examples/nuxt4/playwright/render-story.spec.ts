import { expect, test } from '@playwright/test'

test.describe('story render', () => {
  test('renders the story content', async ({ page }) => {
    await page.goto('/story/app-components-simple-story-vue?variantId=_default')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.getByText('Simple story in Nuxt NuxtLink')).toBeVisible()
  })

  test('keeps the `nuxt-test` app empty inside the sandbox', async ({ page }) => {
    await page.goto('/story/app-components-simple-story-vue?variantId=_default')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.locator('#nuxt-test[data-v-app]')).toBeEmpty()
  })

  test('renders auto-imported components', async ({ page }) => {
    await page.goto('/story/app-components-autoimport-story-vue?variantId=_default')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.getByText('Meow')).toBeVisible()
  })

  test('renders NuxtLink', async ({ page }) => {
    await page.goto('/story/app-components-basebuttonlink-story-vue?variantId=_default')
    await expect(page.locator('.histoire-generic-render-story a')).toContainText('Hello world')
  })

  test('renders the public config populated from Nuxt', async ({ page }) => {
    await page.goto('/story/app-components-autoimport-story-vue?variantId=_default')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.locator('.histoire-generic-render-story p[data-testid="config"]')).toContainText('test')
  })
})
