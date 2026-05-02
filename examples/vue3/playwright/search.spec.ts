import { expect, test } from '@playwright/test'

test.describe('search', () => {
  test('finds stories and variants by title', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('search-btn').click()

    const input = page.getByTestId('search-modal').locator('input')
    await input.fill('Demo')
    await expect(page.getByTestId('search-item').first()).toBeVisible()
    await expect.poll(async () => page.getByTestId('search-item').count()).toBeGreaterThan(3)

    await page.getByTestId('search-item').filter({ hasText: 'untitled' }).first().click()
    await expect(page.getByTestId('story-variant-single-view')).toContainText('untitled')

    await page.getByTestId('search-btn').click()
    await page.getByTestId('search-modal').locator('input').fill('variant 2')
    await expect(page.locator('[data-test-id="search-item"][data-selected]')).toContainText('Variant 2')
    await page.getByTestId('search-modal').locator('input').press('Enter')
    await expect(page.getByTestId('story-variant-single-view')).toContainText('Variant 2')
  })

  // TODO: keyboard navigation race — the second selection doesn't update the
  // [data-selected] attribute fast enough between clears. Needs a finer wait.
  test.fixme('navigates results with the keyboard', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('search-btn').click()

    await page.getByTestId('search-modal').locator('input').fill('Demo')
    await expect(page.locator('[data-test-id="search-item"][data-selected]')).toContainText('Demo')
    await page.getByTestId('search-modal').locator('input').press('ArrowDown')
    await page.getByTestId('search-modal').locator('input').press('Enter')
    await expect(page.getByTestId('story-variant-single-view')).toContainText('untitled')

    await page.getByTestId('search-btn').click()
    const input = page.getByTestId('search-modal').locator('input')
    await input.fill('')
    await input.fill('Demo')
    await expect(page.locator('[data-test-id="search-item"][data-selected]')).toContainText('Demo')
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    await input.press('Enter')
    await expect(page.getByTestId('story-variant-single-view')).toContainText('Variant 2')
  })

  test('closes via backdrop click and Escape', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('search-btn').click()
    await expect(page.getByTestId('search-modal')).toBeVisible()
    await page.locator('body').click({ position: { x: 10, y: 10 } })
    await expect(page.getByTestId('search-modal')).toBeHidden()

    await page.getByTestId('search-btn').click()
    await page.getByTestId('search-modal').locator('input').press('Escape')
    await expect(page.getByTestId('search-modal')).toBeHidden()
  })

  test('finds matches inside docs content', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('search-btn').click()
    await page.getByTestId('search-modal').locator('input').fill('welcome')
    await expect(page.getByTestId('search-item').first()).toBeVisible()
    await expect.poll(async () => page.getByTestId('search-item').count()).toBeGreaterThan(3)
    await expect(page.getByTestId('search-item').filter({ hasText: 'Introduction' })).toBeVisible()
  })
})
