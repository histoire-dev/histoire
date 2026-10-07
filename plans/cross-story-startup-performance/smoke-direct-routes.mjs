import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../examples/vue3/package.json', import.meta.url))

const { chromium } = require('playwright')

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:6090'
let browser
let page
let pageErrors

/** Return the selected ready preview document after a direct story navigation. */
async function selectedPreview() {
  const frameElement = await page.locator('.histoire-canvas-frame.is-selected [aria-busy="false"] iframe[title="Histoire variant"]').first().elementHandle({ timeout: 30000 })
  const frame = await frameElement.contentFrame()
  assert.ok(frame, 'selected preview frame is available')
  return frame
}

/** Check Vitest story mocks and state synchronization from embedded controls. */
async function checkVitestStory() {
  await page.goto(`${baseUrl}/story/src-components-vitestmocking-story-vue?variantId=src-components-vitestmocking-story-vue-0`)
  let preview = await selectedPreview()
  await preview.getByText('Mocked by Vitest for Vitest browser mode').waitFor({ timeout: 30000 })

  await page.goto(`${baseUrl}/story/src-components-vitestmocking-story-vue?variantId=src-components-vitestmocking-story-vue-1`)
  preview = await selectedPreview()
  await preview.locator('[data-test-id="controlled-name"]').getByText('Histoire').waitFor({ timeout: 30000 })
  const controls = page.frameLocator('iframe[title="Histoire custom controls"]')
  const name = controls.locator('input').first()
  await name.waitFor({ timeout: 30000 })
  await name.fill('Cypress')
  await preview.locator('[data-test-id="controlled-name"]').getByText('Cypress').waitFor({ timeout: 15000 })
}

/** Check lazy JSON control loading and model update from CodeMirror input. */
async function checkJsonControl() {
  await page.goto(`${baseUrl}/story/src-components-controls-story-vue?variantId=src-components-controls-story-vue-0`)
  const preview = await selectedPreview()
  await preview.locator('.state-output').getByText('"foo": "bar"').waitFor({ timeout: 30000 })
  const controls = page.frameLocator('iframe[title="Histoire custom controls"]')
  await controls.locator('.histoire-control-label').filter({ hasText: 'HstJson' }).waitFor({ timeout: 30000 })
  const editor = controls.locator('.cm-editor')
  await editor.waitFor({ timeout: 30000 })
  const content = editor.locator('.cm-content')
  await content.click()
  await content.press('Control+A')
  await content.type('{"foo":"baz"}')
  await preview.locator('.state-output').getByText('"foo": "baz"').waitFor({ timeout: 15000 })
}

/** Check generated source and dynamic switching to the story-file source. */
async function checkSourceModes() {
  await page.goto(`${baseUrl}/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0`)
  const preview = await selectedPreview()
  await preview.getByText('Hello world!').waitFor({ timeout: 30000 })
  const source = page.locator('[aria-label="Source"]')
  const expand = source.locator('[aria-label="Expand source"]')
  if (await expand.count()) await expand.click()
  const content = page.locator('[data-test-id="story-source-code"] .histoire-source-content')
  await content.waitFor({ timeout: 30000 })
  assert.ok((await content.textContent()).includes('Hello world!'), 'generated source reflects selected story')
  await page.locator('[aria-label="Source mode"] button').filter({ hasText: 'Story file' }).click()
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-test-id="story-source-code"] .histoire-source-content')?.textContent ?? ''
    return text.includes('<Story') && text.includes('<docs')
  }, null, { timeout: 30000 })
}

async function main() {
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))

  try {
    await checkVitestStory()
    await checkJsonControl()
    await checkSourceModes()
    assert.deepEqual(pageErrors, [], 'page errors')
    process.stdout.write(`PASS ${baseUrl}: Vitest mock and controls; HstJson model update; generated/story-file source\n`)
  }
  finally {
    await browser.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
