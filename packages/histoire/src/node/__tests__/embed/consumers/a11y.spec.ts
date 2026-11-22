import type { Locator } from 'playwright'
import { access, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { launchEmbedBrowser, STANDALONE_SELECTED_FRAME, trackPageReloads } from '../../utils/embed/browser.js'
import { servePluginBook, writePluginBook } from '../../utils/embed/plugin-book-consumer.js'
import { MCP_REPOSITORY_ROOT } from '../../utils/mcp/cli-project.js'
import { closeMcpFixtures, startMcpProcess } from '../../utils/mcp/process.js'
import { createMcpProjectFixture } from '../../utils/mcp/project.js'
import { createPackedPackageConsumer, fixturePackageVersion } from '../../utils/package-consumer.js'

const cleanup: (() => Promise<unknown>)[] = []
afterAll(() => closeMcpFixtures(cleanup))
/** Deterministic engine rule; independent of unrelated story semantics. */
const scan = { axe: { runOnly: { type: 'rule', values: ['image-alt'] } } }

/** Install tarballs with only framework's own runtime and compiler. */
async function consumer(framework: 'vue' | 'react', tests = false) {
  const fixture = await createMcpProjectFixture()
  cleanup.push(() => fixture.close())
  const names = framework === 'vue' ? ['vue', '@vitejs/plugin-vue'] : ['react', 'react-dom', '@vitejs/plugin-react']
  if (tests) names.push('vitest', '@vitest/browser-playwright', 'playwright')
  const dependencies = Object.fromEntries(await Promise.all([...names, 'vite'].map(async name => [name, await fixturePackageVersion(name, framework === 'vue' ? 'vue3' : 'react')])))
  const packages = ['histoire', `@histoire/plugin-${framework}`, '@histoire/plugin-a11y']
  if (tests) {
    packages.push('@histoire/plugin-svelte')
    for (const name of ['svelte', '@sveltejs/vite-plugin-svelte']) dependencies[name] = await fixturePackageVersion(name, 'svelte4')
  }
  return createPackedPackageConsumer(fixture.root, { packages, dependencies })
}

/** Public configuration consumed by actual installed book. */
async function book(root: string, framework: 'vue' | 'react' | 'svelte' | 'vanilla', options: object = {}) {
  return writePluginBook(root, framework, 'history', 'import {HstA11y} from \'@histoire/plugin-a11y\'', `HstA11y(${JSON.stringify({ ...scan, ...options })})`)
}

/** Run CLI using consumer's installed entry, returning real exit status and diagnostics. */
async function testBook(root: string, book: string) {
  const process = startMcpProcess(['test', '--', '--reporter=verbose'], book, {}, join(root, 'node_modules/histoire/bin.mjs'))
  try {
    const result = await process.waitForExit(180000)
    return { ...result, output: process.output() }
  }
  finally { await process.close() }
}

/** Choose visible tab or same tab through standard inspector overflow menu. */
async function selectInspectorTab(page: any, label: string): Promise<void> {
  const tab = page.getByRole('tab', { name: label })
  if (await tab.isVisible()) {
    await tab.click()
  }
  else {
    await page.getByRole('button', { name: 'More tabs' }).click()
    await page.getByRole('menuitem', { name: label }).click()
  }
}

/** The status counter exposes its count and label together in its tooltip. */
function violationCounter(panel: Locator) {
  return panel.getByRole('status').getByTitle('1 violation', { exact: true })
}

let cliConsumer: ReturnType<typeof consumer> | undefined

/** Reuse packed dependency closure across sequential browser-runtime smoke checks. */
function installedCli() {
  return cliConsumer ??= consumer('vue', true)
}

describe('installed accessibility plugin', () => {
  it('runs real inspector, highlighting and live repairs in Vue dev book', async () => {
    const installed = await consumer('vue')
    expect((await realpath(join(installed.root, 'node_modules/@histoire/plugin-a11y'))).startsWith(MCP_REPOSITORY_ROOT)).toBe(false)
    const inventory = installed.inventories['@histoire/plugin-a11y']
    expect(inventory).toEqual(expect.arrayContaining(['package/dist/index.js', 'package/dist/client.js', 'package/dist/frame.js', 'package/dist/test.js', 'package/README.md', 'package/LICENSE']))
    expect(inventory.some(path => /\.(?:vue|tsx)$/.test(path))).toBe(false)
    const directory = await book(installed.root, 'vue')
    const server = await servePluginBook(installed.root, directory, 'dev')
    cleanup.push(() => server.close())
    const browser = await launchEmbedBrowser()
    cleanup.push(() => browser.close())
    const page = await browser.newPage()
    const reloads = trackPageReloads(page)
    await page.goto(`${server.url}story/audit?variantId=issues&tab=a11y:accessibility`)
    await reloads.settled()
    const panel = page.getByRole('region', { name: 'Accessibility audit' })
    await violationCounter(panel).waitFor({ timeout: 60_000 })
    if (process.env.HISTOIRE_A11Y_EVIDENCE_DIR) {
      const directory = process.env.HISTOIRE_A11Y_EVIDENCE_DIR
      await mkdir(directory, { recursive: true })
      await page.screenshot({ path: join(directory, 'light.png') })
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.screenshot({ path: join(directory, 'dark.png') })
      await page.emulateMedia({ colorScheme: 'light' })
      await page.getByRole('separator', { name: 'Resize inspector' }).press('Home')
      await page.screenshot({ path: join(directory, 'narrow.png') })
    }
    const severity = panel.getByRole('button', { name: 'Severity', exact: true })
    await severity.click()
    if (process.env.HISTOIRE_A11Y_EVIDENCE_DIR) {
      await page.getByRole('option', { name: 'Minor', exact: true }).waitFor()
      await page.screenshot({ path: join(process.env.HISTOIRE_A11Y_EVIDENCE_DIR, 'select.png') })
    }
    await page.getByRole('option', { name: 'Minor', exact: true }).click()
    await expect.poll(() => panel.textContent()).toContain('No matching findings')
    await severity.click()
    await page.getByRole('option', { name: 'All severities', exact: true }).click()
    await expect.poll(() => panel.locator('summary').count()).toBe(1)
    await panel.locator('summary').click()
    await panel.getByRole('button', { name: 'Highlight in canvas', exact: true }).click()
    const frame = page.frameLocator(STANDALONE_SELECTED_FRAME)
    await expect.poll(() => frame.locator('[data-histoire-a11y-highlight]').count()).toBe(1)
    // Live repair must replace findings, not merely hide existing result rows.
    await frame.locator('img').evaluate((image: Element) => image.setAttribute('alt', 'Repaired'))
    await expect.poll(() => panel.textContent(), { timeout: 30000 }).toContain('No violations found')
    await panel.getByRole('switch', { name: 'Auto-run' }).uncheck()
    await page.reload()
    await expect.poll(() => panel.getByRole('switch', { name: 'Auto-run' }).isChecked(), { timeout: 30000 }).toBe(false)
    await expect.poll(() => panel.textContent()).toContain('Ready to check')
    await panel.getByRole('button', { name: 'Run', exact: true }).click()
    await violationCounter(panel).waitFor()
    // Manual mode preserves findings but marks them stale until explicitly rerun.
    await frame.locator('img').evaluate((image: Element) => image.setAttribute('alt', 'Manual repair'))
    await expect.poll(() => panel.textContent()).toContain('Results may be outdated')
    expect(await violationCounter(panel).isVisible()).toBe(true)
    await panel.getByRole('button', { name: 'Run', exact: true }).click()
    await expect.poll(() => panel.textContent(), { timeout: 30000 }).toContain('No violations found')
    await panel.getByRole('switch', { name: 'Auto-run' }).check()
    // HMR replaces actor; newly mounted DOM must receive fresh, correctly scoped report.
    const source = join(directory, 'Audit.story.vue')
    await writeFile(source, `<template><Story id="audit" title="Audit"><Variant id="issues" title="Issues" :init-state="() => ({ broken: false })"><template #default="{ state }"><button @click="state.broken = true">Remove image label</button><button @click="state.broken = false">Repair image label</button><img :alt="state.broken ? undefined : 'Hot repair'"></template></Variant></Story></template>`)
    await expect.poll(() => frame.locator('img').getAttribute('alt'), { timeout: 30000 }).toBe('Hot repair')
    await expect.poll(() => panel.textContent(), { timeout: 30000 }).toContain('No violations found')
    await frame.getByRole('button', { name: 'Remove image label' }).click()
    await violationCounter(panel).waitFor({ timeout: 15_000 })
    await selectInspectorTab(page, 'Props')
    await frame.getByRole('button', { name: 'Repair image label' }).click()
    await expect.poll(() => frame.locator('img').getAttribute('alt')).toBe('Hot repair')
    await selectInspectorTab(page, 'Accessibility')
    await expect.poll(async () => ({ alt: await frame.locator('img').getAttribute('alt'), text: await panel.textContent() }), { timeout: 15000 }).toEqual({ alt: 'Hot repair', text: expect.stringContaining('No violations found') })
  })

  it('ships working static React inspector without project Vue installation', async () => {
    const installed = await consumer('react')
    await expect(access(join(installed.root, 'node_modules/vue'))).rejects.toThrow()
    const directory = await book(installed.root, 'react')
    const server = await servePluginBook(installed.root, directory, 'static')
    cleanup.push(() => server.close())
    const browser = await launchEmbedBrowser()
    cleanup.push(() => browser.close())
    const page = await browser.newPage()
    await page.goto(`${server.url}story/audit?variantId=issues&tab=a11y:accessibility`)
    await violationCounter(page.getByRole('region', { name: 'Accessibility audit' })).waitFor({ timeout: 60_000 })
  })

  it('adds opt-in CLI case to otherwise testless variant and reports failure then repair', async () => {
    const installed = await installedCli()
    const directory = await book(installed.root, 'vue', { test: true, devOnly: true })
    const failed = await testBook(installed.root, directory)
    expect(failed.code, failed.output).not.toBe(0)
    expect(failed.output).toContain('Accessibility (axe-core)')
    expect(failed.output).toContain('image-alt')
    expect(failed.output).toContain('Audit')
    const path = join(directory, 'Audit.story.vue')
    await writeFile(path, (await readFile(path, 'utf8')).replace('<img ', '<img alt="Example" '))
    const repaired = await testBook(installed.root, directory)
    expect(repaired.code, repaired.output).toBe(0)
    expect(repaired.output).toContain('Accessibility (axe-core)')
    // Authored test keeps its own fresh mount and remains runnable with automatic checks off.
    await writeFile(path, `<script setup>
import { onTest } from 'histoire/client'
import { expect, it } from 'vitest'
onTest(({ canvas }) => it('authored image check', () => expect(canvas.querySelector('img').getAttribute('alt')).toBe('Example')))
</script>
${await readFile(path, 'utf8')}`)
    const combined = await testBook(installed.root, directory)
    expect(combined.code, combined.output).toBe(0)
    expect(combined.output).toContain('2 passed (2)')
    expect(combined.output).toContain('authored image check')
    const config = join(directory, 'histoire.config.ts')
    await writeFile(config, (await readFile(config, 'utf8')).replace('"test":true', '"test":false'))
    const disabled = await testBook(installed.root, directory)
    expect(disabled.code, disabled.output).toBe(0)
    expect(disabled.output).toContain('authored image check')
    expect(disabled.output).not.toContain('Accessibility (axe-core)')
  })
  it.each(['svelte', 'vanilla'] as const)('registers automatic browser test through %s setup hook', async (framework) => {
    const installed = await installedCli()
    const directory = await book(installed.root, framework, { test: true })
    const result = await testBook(installed.root, directory)
    expect(result.code, result.output).not.toBe(0)
    expect(result.output).toContain('Accessibility (axe-core)')
    expect(result.output).toContain('image-alt')
    expect(result.output).toMatch(/Tests\s+1 failed \(1\)/)
  })

  it('omits dev-only inspector and scanner from static book even with CLI tests enabled', async () => {
    const installed = await installedCli()
    const directory = await book(installed.root, 'vanilla', { test: true, devOnly: true })
    const server = await servePluginBook(installed.root, directory, 'static')
    cleanup.push(() => server.close())
    const browser = await launchEmbedBrowser()
    cleanup.push(() => browser.close())
    const page = await browser.newPage()
    await page.goto(`${server.url}story/audit?variantId=issues`)
    await page.getByRole('tab', { name: 'Props', exact: true }).waitFor()
    expect(await page.getByRole('tab', { name: /Accessibility/ }).count()).toBe(0)
    const files = await readdir(join(directory, '.histoire/dist'), { recursive: true })
    expect(files.some(file => file.includes('histoire-a11y-axe'))).toBe(false)
  })
})
