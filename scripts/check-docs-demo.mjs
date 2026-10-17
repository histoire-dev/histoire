import assert from 'node:assert/strict'
import { copyFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { checkReleaseBadges } from './check-docs-release-badges.mjs'

const requireExample = createRequire(new URL('../examples/vue3/package.json', import.meta.url))
const requireHistoire = createRequire(new URL('../packages/histoire/package.json', import.meta.url))
const { chromium } = requireExample('playwright')
const expect = requireExample('playwright/test').expect.configure({ timeout: 15000 })
const sirv = requireHistoire('sirv')
const output = fileURLToPath(new URL('../docs/.vitepress/dist/', import.meta.url))
const screenshots = process.argv.includes('--screenshots')

/** Source expansion persists across story changes; keep existing readable source open. */
async function expandSource(page) {
  const button = page.getByRole('button', { name: 'Expand source', exact: true })
  if (await button.count()) await button.click()
}

/** Captures shipped UI after real canvas and authored controls finish mounting. */
async function captureWorkbench(page, origin) {
  const storyId = 'src-components-basebutton-story-vue'
  const directory = new URL('../docs/public/screenshots/', import.meta.url)
  await mkdir(directory, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme })
    // Fresh navigation also initializes isolated authored controls in this theme.
    await page.goto(`${origin}/demo/#/story/${storyId}?variantId=${storyId}-0`)
    const stories = page.locator('[aria-label="Workbench"] [aria-label="Stories"]')
    if (await stories.getAttribute('aria-expanded') !== 'true') await stories.click()
    await page.getByRole('button', { name: 'Viewport', exact: true }).click()
    await page.getByRole('textbox', { name: 'Custom width', exact: true }).fill('240')
    await page.getByRole('textbox', { name: 'Custom height', exact: true }).fill('180')
    await page.getByRole('textbox', { name: 'Custom height', exact: true }).press('Enter')
    await page.getByRole('button', { name: 'Viewport', exact: true }).click()
    await expandSource(page)
    await expect(page.locator('.histoire-source-content')).toContainText('BaseButton')
    const controls = page.frameLocator('iframe[src*="controls=true"]')
    await expect(controls.getByText('Disabled', { exact: true })).toBeVisible()
    for (const [index, text] of ['Click me', 'Click me', 'Click me!'].entries()) {
      const frame = page.frameLocator('iframe:not([src*="controls=true"])').nth(index)
      await expect(frame.locator('[data-test-id="sandbox-render"]').getByRole('button', { name: text, exact: true })).toBeVisible()
    }
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /htw-dark/ : /^(?!.*htw-dark)/)
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    await page.screenshot({ path: fileURLToPath(new URL(`workbench-${theme}.png`, directory)), animations: 'disabled' })
  }
  await copyFile(new URL('workbench-light.png', directory), new URL('../screenshot.png', import.meta.url))
  process.stdout.write('Updated README and light/dark workbench screenshots.\n')
}

// Plain static serving deliberately has no SPA fallback: /demo/ and hash links
// must work on hosts that know nothing about Histoire's story routes.
const server = createServer(sirv(output, { dev: true }))
let browser
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`)
    }
  })

  await checkReleaseBadges(page, origin, expect)
  await page.goto(origin)
  await page.getByRole('link', { name: 'Open demo', exact: true }).first().click()
  await expect(page).toHaveURL(/\/demo\//)
  await expect(page.locator('[aria-label="Workbench"]')).toBeVisible()

  const storyId = 'src-components-demo-story-vue'
  const variantId = `${storyId}-0`
  await page.goto(`${origin}/demo/#/story/${storyId}?variantId=${variantId}`)
  const canvas = page.frameLocator(`iframe[src*="variantId=${variantId}"]:not([src*="controls=true"])`).locator('[data-test-id="sandbox-render"]')
  await expect(canvas.getByText('Hello world!', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'message', exact: true }).fill('Edited in the demo')
  await expect(canvas.getByText('Edited in the demo', { exact: true })).toBeVisible()

  await expandSource(page)
  await expect(page.locator('.histoire-source-content')).toContainText('Edited in the demo')
  await page.getByRole('tab', { name: 'Docs', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Title 1', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Docs', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Title 1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Screenshot', exact: true })).toHaveCount(0)
  await expect(page.locator('[data-shell-pane="tests"]')).toHaveCount(0)

  // Verify the same public entry works on narrow screens before capturing desktop.
  await page.setViewportSize({ width: 390, height: 844 })
  const stories = page.locator('[aria-label="Workbench"] [aria-label="Stories"]')
  if (await stories.getAttribute('aria-expanded') === 'true') await stories.click()
  await page.getByRole('tab', { name: 'Props', exact: true }).click()
  await expect(canvas.getByText('Hello world!', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1600, height: 1000 })

  if (screenshots) await captureWorkbench(page, origin)

  await page.goto(`${origin}/guide/ui-shell.html`)
  await expect(page.getByRole('heading', { name: /^Workbench layout/ })).toBeVisible()
  if (!screenshots) {
    const image = page.locator('.workbench-demo img:visible')
    await image.scrollIntoViewIfNeeded()
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBe(1600)
  }
  assert.deepEqual(errors, [], 'Docs and demo must load without browser errors or missing local assets')
  process.stdout.write('Docs/demo passed: release badges, navigation, prop editing, source, docs deep link, reload, mobile canvas, static capabilities.\n')
}
finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
