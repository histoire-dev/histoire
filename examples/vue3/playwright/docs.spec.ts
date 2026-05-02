import { expect, test } from '@playwright/test'

test.describe('story docs', () => {
  test('renders the docs panel for a story variant', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('story-list-item').filter({ hasText: 'Demo' }).click()
    await page.getByTestId('story-variant-list-item').filter({ hasText: 'untitled' }).click()
    await page.getByTestId('story-side-panel').getByRole('link', { name: 'Docs' }).click()

    const docs = page.getByTestId('story-docs')
    await expect(docs.locator('h1')).toContainText('Title 1')
    await expect(docs.locator('h2')).toContainText('Title 2')
    await expect(docs.locator('a').filter({ hasText: 'Link' })).toBeVisible()
  })
})
