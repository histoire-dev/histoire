import { expect, test } from '@playwright/test'

test.describe('events', () => {
  test('logs events when story buttons are clicked', async ({ page }) => {
    await page.goto('/story/src-components-eventbutton-story-vue?variantId=_default&tab=events')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const eventItems = page.getByTestId('event-item')

    await iframe.locator('button').filter({ hasText: 'Send' }).click()
    await expect(eventItems.filter({ hasText: 'My event' })).toBeVisible()

    await iframe.locator('button').filter({ hasText: 'Send' }).click()
    await expect(eventItems).toHaveCount(2)

    await iframe.locator('button').filter({ hasText: 'Click' }).click()
    await expect(eventItems).toHaveCount(3)
    await expect(eventItems.filter({ hasText: 'Click' })).toBeVisible()
  })

  test('shows event payload in the popper', async ({ page }) => {
    await page.goto('/story/src-components-eventbutton-story-vue?variantId=_default&tab=events')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')

    await iframe.locator('button').filter({ hasText: 'Send' }).click()
    await page.getByTestId('event-item').filter({ hasText: 'My event' }).click()
    await expect(page.locator('.v-popper__popper')).toContainText('"a": "Hello"')
    await expect(page.locator('.v-popper__popper')).toContainText('"b": "World"')
  })
})
