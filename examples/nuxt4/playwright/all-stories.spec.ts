import { expect, test } from '@playwright/test'

test.describe('stories list', () => {
  test('shows all stories', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await expect(page.getByTestId('story-list-item')).toHaveCount(5)
  })
})
