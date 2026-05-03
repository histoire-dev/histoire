import { expect, test } from '@playwright/test'

test.describe('story preview', () => {
  test('renders the untitled (first) variant', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('story-list-item').filter({ hasText: 'Demo' }).click()
    await expect(page.getByTestId('story-variant-list-item')).toHaveCount(2)
    await page.getByTestId('story-variant-list-item').filter({ hasText: 'untitled' }).click()
    await expect(page.getByTestId('story-variant-single-view')).toContainText('untitled')

    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.getByText('Hello world!')).toBeVisible()
    expect(await page.getByTestId('story-source-code').textContent()).toEqual('<Demo message="Hello world!" />')
  })

  test('renders the second variant', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('story-list-item').filter({ hasText: 'Demo' }).click()
    await expect(page.getByTestId('story-variant-list-item')).toHaveCount(2)
    await page.getByTestId('story-variant-list-item').filter({ hasText: 'Variant 2' }).click()
    await expect(page.getByTestId('story-variant-single-view')).toContainText('Variant 2')

    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    await expect(iframe.getByText('Meow!')).toBeVisible()
    expect(await page.getByTestId('story-source-code').textContent()).toEqual('<Demo message="Meow!" />')
  })
})
