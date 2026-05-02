import { expect, test } from '@playwright/test'

test.describe('state sync', () => {
  // Same upstream bug as the controls-render fixmes:
  // `Hst.Checkbox` doesn't mount the Vue control under Svelte 5 compat,
  // so the controls panel never wires up. Cypress fails identically.
  test.fixme('syncs disabled state between iframe story and controls', async ({ page }) => {
    await page.goto('/story/src-basebutton-story-svelte?variantId=_default')
    const iframe = page.frameLocator('iframe[data-test-id="preview-iframe"]')
    const controls = page.getByTestId('story-controls')

    await expect(iframe.locator('button')).not.toHaveClass(/disabled/)

    await controls.locator('[role="checkbox"]').click()
    await expect(controls.locator('pre')).toContainText('"disabled": true')
    await expect(iframe.locator('button')).toHaveClass(/disabled/)

    await iframe.locator('input[type="checkbox"]').click()
    await expect(controls.locator('pre')).toContainText('"disabled": false')
  })

  test.fixme('syncs text state between inline story and controls', async ({ page }) => {
    await page.goto('/story/src-noiframe-story-svelte?variantId=_default')
    const sandbox = page.getByTestId('sandbox-render')
    const controls = page.getByTestId('story-controls')

    await expect(sandbox.getByText('Some content', { exact: true })).toBeVisible()

    await controls.locator('input').fill('42')
    await expect(sandbox.getByText('42', { exact: true })).toBeVisible()

    await sandbox.locator('input').fill('Meow')
    await expect(controls.locator('input')).toHaveValue('Meow')
  })
})
