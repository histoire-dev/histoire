import { expect, test } from '@playwright/test'

test.describe('stories list', () => {
  test('shows all stories with the expected variant counts', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    await expect(page.getByTestId('story-list-item')).toHaveCount(35)
    await expect(page.getByTestId('story-list-item').filter({ hasText: '🐱 Meow' })).toBeVisible()
    await expect(page.getByTestId('story-list-item').filter({ hasText: 'BaseButton' })).toContainText('3')
    await expect(page.getByTestId('story-list-item').filter({ hasText: 'Demo' })).toBeVisible()
    await expect(page.getByTestId('story-list-folder')).toHaveCount(2)
  })

  test('toggles folder visibility', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    // Filter on the title button instead of the folder element so nested
    // folder names don't leak into the parent's text content.
    const folderButton = (label: string) =>
      page.locator('[data-test-id="story-list-folder"] [role="button"]').filter({ hasText: label })

    await folderButton('Sub Folder').click()
    await expect(page.getByTestId('story-list-item').filter({ hasText: 'Sub Story 2' })).toBeVisible()

    await folderButton('Meow').click()
    await expect(page.getByTestId('story-list-item').filter({ hasText: 'Sub Story 1' })).toBeVisible()

    await folderButton('Meow').click()
    await expect(page.getByTestId('story-list-item').filter({ hasText: 'Sub Story 1' })).toHaveCount(0)

    await folderButton('Sub Folder').click()
    await expect(page.getByTestId('story-list-item').filter({ hasText: 'Sub Story 2' })).toHaveCount(0)
  })
})
