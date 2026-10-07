/** Verify native Tab navigation can advance beyond the initially rendered Tailwind token window. */
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const { chromium } = require(require.resolve('playwright', { paths: [path.join(repoRoot, 'examples/vue3')] }))
const baseUrl = process.argv[2]

if (!baseUrl) {
  throw new Error('Usage: node plans/tailwind-switch-performance/focus-tab.cjs <base-url>')
}

/** Returns logical token key for the canvas document's active element. */
async function getActiveToken(frame) {
  return frame.evaluate(() => {
    const active = document.activeElement
    const cell = active?.closest('[data-token-virtual-key]')
    return {
      key: cell?.getAttribute('data-token-virtual-key') ?? null,
      label: active?.getAttribute('aria-label') ?? null,
    }
  })
}

/** Advance from first copy action until focus leaves iframe or reaches a newly rendered token. */
async function verifyTabWindow(frame, page) {
  const initialKeys = await frame.locator('[data-token-virtual-key]').evaluateAll(elements => elements.map(element => element.dataset.tokenVirtualKey))
  const firstButton = frame.locator(`[data-token-virtual-key="${initialKeys[0]}"] button[aria-label="Copy token name"]`)
  await firstButton.focus()

  const visitedKeys = []
  let active = await getActiveToken(frame)
  for (let index = 0; index < initialKeys.length * 2 + 1; index++) {
    await page.keyboard.press('Tab')
    active = await getActiveToken(frame)
    if (!active.key) break
    visitedKeys.push(active.key)
    if (!initialKeys.includes(active.key)) break
  }

  return {
    initialCount: initialKeys.length,
    initialFirstKey: initialKeys[0],
    initialLastKey: initialKeys.at(-1),
    visitedKeys,
    finalActiveKey: active.key,
    reachedBeyondInitialWindow: visitedKeys.some(key => !initialKeys.includes(key)),
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.goto(`${baseUrl}/story/tailwind?variantId=background-color&arrange=single`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('.histoire-canvas-replica[aria-busy="false"] iframe').waitFor({ timeout: 60000 })
    const frame = await page.locator('.histoire-canvas-replica iframe').elementHandle().then(element => element.contentFrame())
    await frame.locator('[data-token-virtual-key] button[aria-label="Copy token name"]').first().waitFor({ timeout: 60000 })
    const report = await verifyTabWindow(frame, page)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (!report.reachedBeyondInitialWindow) process.exitCode = 1
  }
  finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
