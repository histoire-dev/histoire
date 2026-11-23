import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { expect, it } from 'vitest'
import { launchEmbedBrowser, STANDALONE_SELECTED_FRAME } from '../../utils/embed/browser.js'
import { createEmbedVueProject } from '../../utils/embed/vue-project.js'

it.each([
  { base: '/', vueOptions: '' },
  { base: '/book/', vueOptions: '{ template: { transformAssetUrls: { img: ["src"], "asset-image": ["asset"] } } }' },
])('serves relative Vue template assets in a static book at $base', async ({ base, vueOptions }) => {
  const fixture = await createEmbedVueProject('Vue template assets')
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
  try {
    await mkdir(join(fixture.root, 'stories', 'images'), { recursive: true })
    await Promise.all([
      writeFile(join(fixture.root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { base: ${JSON.stringify(base)}, build: { assetsInlineLimit: 0 }, plugins: [vue(${vueOptions})] }`),
      writeFile(join(fixture.root, 'histoire.config.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins: [HstVue()], storyMatch: ['stories/*.story.vue'], collectMaxThreads: 1, mcp: false }`),
      writeFile(join(fixture.root, 'stories', 'Asset.story.vue'), `
        <script setup>
        import { ref } from 'vue'
        import AssetImage from './AssetImage.vue'
        const label = ref('Relative image')
        </script>
        <template>
          <Story id="relative-image">
            ${vueOptions ? '<asset-image asset="./images/probe.svg" :alt="label" />' : '<img src="./images/probe.svg" :alt="label" />'}
          </Story>
        </template>
      `),
      writeFile(join(fixture.root, 'stories', 'AssetImage.vue'), '<script setup>defineProps([\'alt\', \'asset\'])</script><template><img :src="asset" :alt="alt" /></template>'),
      writeFile(join(fixture.root, 'stories', 'images', 'probe.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="green"/></svg>'),
    ])
    project = await createHistoireProject({ root: fixture.root })
    await project.build()
    const server = await project.preview({ host: '127.0.0.1', port: 0 })
    await server.ready
    browser = await launchEmbedBrowser()
    const page = await browser.newPage()
    await page.goto(new URL('story/relative-image?variantId=_default', server.url).href)
    const image = page.frameLocator(STANDALONE_SELECTED_FRAME)
      .locator('[data-test-id="sandbox-render"]')
      .getByRole('img', { name: 'Relative image', exact: true })
    // Let Playwright resolve the frame, then wait for the browser to decode the image.
    const { naturalWidth, pathname } = await image.evaluate(async (element: HTMLImageElement) => {
      await element.decode()
      return { naturalWidth: element.naturalWidth, pathname: new URL(element.currentSrc).pathname }
    }, undefined, { timeout: 8_000 })
    expect(naturalWidth).toBe(40)
    expect(pathname).toMatch(new RegExp(`^${base}assets/`))
  }
  finally {
    await browser?.close()
    await project?.close()
    await fixture.close()
  }
})
