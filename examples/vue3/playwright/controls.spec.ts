import { expect, test } from '@playwright/test'

test.describe('controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('story-list-item').filter({ hasText: /^Controls\d*$/ }).click()
  })

  test('HstText updates the bound state', async ({ page }) => {
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('.state-output')).toContainText('"text": "Hello"')
    await controls.locator('.histoire-wrapper').filter({ hasText: 'HstText' }).locator('input').fill('Foo')
    await expect(iframe.locator('.state-output')).toContainText('"text": "Foo"')
  })

  test('HstCheckbox toggles the bound state', async ({ page }) => {
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('.state-output')).toContainText('"checkbox": false')
    await controls.getByText('HstCheckbox').click()
    await expect(iframe.locator('.state-output')).toContainText('"checkbox": true')
    await controls.getByText('HstCheckbox').click()
    await expect(iframe.locator('.state-output')).toContainText('"checkbox": false')
  })

  test('HstNumber updates the bound state', async ({ page }) => {
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('.state-output')).toContainText('"number": 20')
    await controls.locator('input[type="number"]').fill('42')
    await expect(iframe.locator('.state-output')).toContainText('"number": 42')
  })

  test('HstTextarea updates the bound state', async ({ page }) => {
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('.state-output')).toContainText('"longText": "Longer text..."')
    await controls.locator('textarea').fill('Meow meow meow')
    await expect(iframe.locator('.state-output')).toContainText('"longText": "Meow meow meow"')
  })

  test('HstColorSelect updates the bound state', async ({ page }) => {
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('.state-output')).toContainText('"colorselect": "#000000"')
    await controls.locator('.histoire-wrapper').filter({ hasText: 'HstColorSelect' }).locator('input[type="text"]').fill('#ffffff')
    await expect(iframe.locator('.state-output')).toContainText('"colorselect": "#ffffff"')
  })
})
