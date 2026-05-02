import { test } from '@playwright/test'

// TODO: controls-slot state sync tests need finer iframe-ready synchronization
// than the implicit Cypress retries provided. Skipping until a reliable wait
// is wired up; see playwright/render-story.spec.ts for the analogous case.
test.describe.skip('state sync', () => {
  test('syncs disabled state between iframe story and controls', async () => {})
  test('syncs text state between inline story and controls', async () => {})
})
