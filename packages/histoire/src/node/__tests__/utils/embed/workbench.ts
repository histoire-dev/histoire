import type { Page } from 'playwright'

/**
 * Opens visual tests tab of workbench Tests pane.
 *
 * Rail buttons toggle their pane and a reloaded workbench restores last open pane, so Tests rail button is only
 * clicked when its pane is not already expanded.
 */
export async function openVisualTestsPane(page: Page): Promise<void> {
  const rail = page.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name: /^Tests/ })
  await rail.waitFor()
  if (await rail.getAttribute('aria-expanded') !== 'true') await rail.click()
  await page.getByRole('group', { name: 'Test type', exact: true }).getByRole('button', { name: 'Visual', exact: true }).click()
}
