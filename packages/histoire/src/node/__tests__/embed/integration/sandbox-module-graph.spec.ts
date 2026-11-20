import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

/**
 * Upper bound of Histoire-owned module requests one dev sandbox document may
 * make. Inspection adds its entry and shared provider registry chunk, and
 * delayed loading indicators use one separate shared entry. Unbundled output was about 180, so exceeding this
 * budget indicates a runtime fell back to per-file modules.
 */
const HISTOIRE_MODULE_BUDGET = 28

/** Matches the Histoire package owning a served file, workspace or installed. */
const HISTOIRE_PACKAGE_RE = /\/(?:packages\/histoire(?:-([\w-]+))?|node_modules\/(?:@histoire\/([\w-]+)|histoire))\//

/**
 * Groups the script module URLs of Histoire packages by package name
 * (`histoire` for the core package, `shared` for `@histoire/shared`, ...).
 * @param urls Resource URLs loaded by one document.
 */
function groupHistoireModuleUrls(urls: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const url of urls) {
    const { pathname } = new URL(url)
    const match = decodeURIComponent(pathname).match(HISTOIRE_PACKAGE_RE)
    if (!match || !/\.(?:m?js|ts|vue)$/.test(pathname)) continue
    const name = match[1] ?? match[2] ?? 'histoire'
    groups.set(name, [...groups.get(name) ?? [], url])
  }
  return groups
}

describe('dev sandbox module graph', () => {
  it('loads each stateful Histoire runtime once, as a few bundled modules', async () => {
    const fixture = await createEmbedBridgeFixture({
      mode: 'dev',
      // A story also consumes the public entry; both paths must share app state.
      story: `<script setup>
import { isDark } from 'histoire/client'
import { ref } from 'vue'
const dark = ref(isDark())
</script>
<template><Story id="overlap" title="Bridge book"><Variant id="main"><button @click="dark = isDark()">Bridge book</button><output>{{ dark ? 'Dark' : 'Light' }}</output></Variant></Story></template>`,
    })
    try {
      const url = new URL('__sandbox.html?storyId=overlap&variantId=main&embed=true', fixture.bookUrl).href
      // First document may be reloaded by the dep optimizer: measure a later one.
      const cold = await fixture.browser.newPage()
      await cold.goto(url)
      await cold.getByRole('button', { name: 'Bridge book', exact: true }).waitFor({ timeout: 60_000 })
      await cold.close()

      const page = await fixture.browser.newPage()
      await page.addInitScript(() => performance.setResourceTimingBufferSize(100_000))
      await page.goto(url)
      const button = page.getByRole('button', { name: 'Bridge book', exact: true })
      await button.waitFor({ timeout: 60_000 })
      const sandboxUrl = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname.endsWith('/dist/bundled/sandbox.js')))
      expect(sandboxUrl).toBeDefined()
      // Mutate through the actual loaded sandbox entry and read through the
      // story API. Explicit reads work across the two independent Vue runtimes.
      for (const colorScheme of ['dark', 'light']) {
        // String source keeps Vitest from rewriting this browser-only import.
        const applied = await page.evaluate(`import(${JSON.stringify(sandboxUrl)}).then(sandbox => {
          sandbox.applyPreviewSettings({ colorScheme: ${JSON.stringify(colorScheme)} })
          return sandbox.isDark.value
        })`)
        expect(applied).toBe(colorScheme === 'dark')
        await button.click()
        await expect.poll(() => page.getByRole('status').textContent()).toBe(colorScheme === 'dark' ? 'Dark' : 'Light')
      }
      const urls: string[] = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name))
      const modules = groupHistoireModuleUrls(urls)
      const appModules = modules.get('app')!
      expect(appModules.length).toBeGreaterThan(0)
      // `sandbox.js`, the shared and controls chunks and Rolldown's runtime helper,
      // plus `bundle-index.js` and `api.js` for the story's `histoire/client` import.
      expect(appModules.length).toBeLessThanOrEqual(6)
      expect(appModules.filter(url => url.includes('/dist/embed/'))).toEqual([])
      const histoireUrls = [...modules.values()].flat()
      expect(histoireUrls.length).toBe(new Set(histoireUrls).size)
      // Query variants still instantiate the same file twice, even if URLs differ.
      const paths = histoireUrls.map(url => decodeURIComponent(new URL(url).pathname))
      expect(paths.length).toBe(new Set(paths).size)
      // The inspection entry and main entry must resolve the same provider state.
      const shared = modules.get('shared')!
      const main = shared.filter(url => /\/dist\/index\.js\?/.test(url))
      const inspection = shared.filter(url => /\/dist\/inspection\/index\.js\?/.test(url))
      const registry = shared.filter(url => /\/dist\/chunks\/provider-registry-[^/]+\.js\?/.test(url))
      const loadingDelay = shared.filter(url => /\/dist\/loading-delay\.js\?/.test(url))
      expect(main).toHaveLength(1)
      expect(inspection).toHaveLength(1)
      expect(registry).toHaveLength(1)
      expect(loadingDelay).toHaveLength(1)
      expect(shared.filter(url => !url.includes('/dist/icons/'))).toHaveLength(4)
      const sharedRegistry = await page.evaluate(`Promise.all([import(${JSON.stringify(main[0])}), import(${JSON.stringify(inspection[0])})]).then(([main, inspection]) => {
        const root = document.createElement('div')
        const provider = { marker: true }
        const dispose = inspection.registerFrameworkInspection(root, () => provider)
        const shared = main.getFrameworkInspection(root) === provider
        dispose()
        return shared && main.getFrameworkInspection(root) === undefined
      })`)
      expect(sharedRegistry).toBe(true)
      await page.close()
      expect(modules.get('protocol')).toEqual([expect.stringMatching(/\/dist\/index\.js\?/)])
      expect(modules.get('histoire')!.length).toBeLessThanOrEqual(5)
      expect(modules.get('plugin-vue')!.length).toBeLessThanOrEqual(5)
      const total = [...modules.values()].reduce((count, list) => count + list.length, 0)
      expect(total).toBeLessThanOrEqual(HISTOIRE_MODULE_BUDGET)
    }
    finally {
      await fixture.close()
    }
  })
})
