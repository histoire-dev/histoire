import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const appRequire = createRequire(new URL('../../../../histoire-app/package.json', import.meta.url))
const nodeRequire = createRequire(new URL('../../../../histoire/package.json', import.meta.url))
const { chromium } = nodeRequire('playwright')
const { default: vue } = await import(appRequire.resolve('@vitejs/plugin-vue'))
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  resolve: { dedupe: ['vue'], alias: { 'virtual:$histoire-marketplace-official': fileURLToPath(new URL('../utils/marketplace-official.ts', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] } },
  logLevel: 'error',
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${server.resolvedUrls.local[0]}browser.html`)
  const opener = page.getByRole('button', { name: 'Browse marketplace' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Plugin marketplace' })
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), true)
  assert.equal(await page.getByRole('searchbox', { name: 'Search plugins' }).evaluate(element => element === document.activeElement), true)
  await page.getByRole('button', { name: 'Close marketplace' }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true)
  await page.getByRole('button', { name: 'Discover', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.getByRole('button', { name: 'Close marketplace' }).evaluate(element => element === document.activeElement), true)
  // Native top-layer inertness rejects focus on the underlying workbench.
  await opener.evaluate(element => element.focus())
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true)
  await page.getByRole('button', { name: 'All plugins', exact: true }).focus()
  await page.keyboard.press('/')
  assert.equal(await page.getByRole('searchbox').evaluate(element => element === document.activeElement), true)
  await page.keyboard.type('axe')
  assert.equal(await page.getByRole('button', { name: 'All plugins', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await opener.evaluate(element => element === document.activeElement), true)
  await opener.click()
  await dialog.waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Close marketplace' }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await opener.evaluate(element => element === document.activeElement), true)
  assert.deepEqual(errors, [])
  process.stdout.write('PASS: native modal, focus containment, inertness, slash, search, Escape, close, focus return\n')
}
finally {
  await browser?.close()
  await server.close()
}
