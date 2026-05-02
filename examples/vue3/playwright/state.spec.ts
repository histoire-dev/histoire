import { expect, test } from '@playwright/test'

test.describe('state options API', () => {
  test('syncs state between iframe story and controls', async ({ page }) => {
    await page.goto('/story/src-components-stateoption-story-vue?variantId=src-components-stateoption-story-vue-0')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('.state-output')).toContainText('"optionApiData": "OPTION API"')
    await controls.locator('input[type="text"]').fill('Meow')
    await expect(iframe.locator('.state-output')).toContainText('"optionApiData": "Meow"')
  })
})

test.describe('state setup API', () => {
  test('syncs +1 button and text input', async ({ page }) => {
    await page.goto('/story/src-components-statesetup-story-vue?variantId=src-components-statesetup-story-vue-0')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('pre')).toContainText('"count": 0')
    await expect(iframe.locator('pre')).toContainText('"text": "Meow"')

    const plusButton = controls.locator('.controls').getByText('+1')
    await plusButton.click()
    await plusButton.click()
    await controls.locator('input[type="text"]').first().fill('Waf')

    await expect(iframe.locator('pre')).toContainText('"count": 2')
    await expect(iframe.locator('pre')).toContainText('"text": "Waf"')
  })
})

test.describe('state setup API (2)', () => {
  test('syncs +1 button and text input', async ({ page }) => {
    await page.goto('/story/src-components-statesetup2-story-vue?variantId=src-components-statesetup2-story-vue-0')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('pre')).toContainText('"count": 0')
    await expect(iframe.locator('pre')).toContainText('"text": "Meow"')

    const plusButton = controls.locator('.controls').getByText('+1')
    await plusButton.click()
    await plusButton.click()
    await controls.locator('input[type="text"]').first().fill('Waf')

    await expect(iframe.locator('pre')).toContainText('"count": 2')
    await expect(iframe.locator('pre')).toContainText('"text": "Waf"')
  })
})
