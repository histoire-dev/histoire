/** Feature pages introduced after the currently published beta. */
const featurePages = [
  'guide/deploy-node',
  'guide/embedding',
  'guide/mcp',
  'guide/react/controls',
  'guide/react/getting-started',
  'guide/react/hierarchy',
  'guide/react/stories',
  'guide/testing',
  'guide/ui-agents',
  'guide/ui-comments',
  'guide/ui-inspector',
  'guide/ui-matrix',
  'guide/ui-navigation',
  'guide/ui-screenshots-mcp',
  'guide/ui-settings',
  'guide/ui-shell',
  'guide/visual-testing',
  'reference/config-codemod',
  'reference/mcp',
  'reference/node-sdk',
  'reference/sdk',
]

/** Checks visible release labels through the shipped docs theme and stable links. */
export async function checkReleaseBadges(page, origin, expect) {
  for (const route of featurePages) {
    await page.goto(`${origin}/${route}.html`)
    await expect(page.getByRole('heading', { level: 1 }).getByText('1.0-beta.2+', { exact: true })).toBeVisible()
  }

  for (const [route, anchor] of [
    ['reference/config', 'mcp'],
    ['reference/config', 'build-target'],
    ['reference/config', 'test-maxworkers'],
    ['reference/config', 'visual'],
    ['reference/client', 'ontest'],
    ['guide/vue3/controls', 'custom-overlays'],
    ['guide/getting-started', 'vite-8-support'],
    ['guide/svelte3/getting-started', 'svelte-5-support'],
    ['guide/svelte3/getting-started', 'sveltekit-3-support'],
    ['examples/tailwind', 'automatic-design-system-stories'],
  ]) {
    await page.goto(`${origin}/${route}.html#${anchor}`)
    await expect(page.locator(`[id="${anchor}"]`).getByText('1.0-beta.2+', { exact: true })).toBeVisible()
  }

  // Established configuration stays available without an unreleased label.
  await page.goto(`${origin}/reference/config.html#plugins`)
  await expect(page.locator('#plugins')).toBeVisible()
  await expect(page.locator('#plugins').getByText('1.0-beta.2+', { exact: true })).toHaveCount(0)
}
