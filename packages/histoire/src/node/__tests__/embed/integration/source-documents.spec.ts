import { cp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import connect from 'connect'
import { createHistoireProject } from 'histoire/node'
import sirv from 'sirv'
import { describe, expect, it } from 'vitest'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { launchEmbedBrowser, readEmbedBrowserSource } from '../../utils/embed/browser.js'
import { createEmbedVueProject } from '../../utils/embed/vue-project.js'
import { createMcpProjectFixture } from '../../utils/mcp/project.js'

describe('real data-only dev and copied static documents', () => {
  it('serves nested source assets, HMR and framing policy without mounting/importing stories', async () => {
    const fixture = await createEmbedVueProject('Data book')
    const copied = await createMcpProjectFixture()
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    let staticServer: ReturnType<typeof createServer> | undefined
    const browser = await launchEmbedBrowser()
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await fixture.setTitle('Data book')
      await writeFile(join(fixture.root, 'custom.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins:[HstVue()],storyMatch:['*.story.vue'],collectMaxThreads:1,mcp:false,embed:{enabled:true,allowedOrigins:['https://baked.test']} }`)
      const storyPath = join(fixture.root, 'Book.story.vue')
      await writeFile(storyPath, `<script>if (typeof window !== 'undefined') window.__SOURCE_IMPORTS__ = (window.__SOURCE_IMPORTS__ || 0) + 1</script>${await readFile(storyPath, 'utf8')}`)
      project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
      const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
      await dev.ready
      const descriptorResponse = await fetch(new URL('histoire-embed.json', dev.url))
      expect(descriptorResponse.headers.get('content-security-policy')).toBe('frame-ancestors \'self\' https://baked.test')
      const devDescriptor = await descriptorResponse.json()
      await page.goto(new URL('__embed.html?view=bridge', dev.url).href)
      expect((await readEmbedBrowserSource(page)).descriptor.catalog).toEqual(devDescriptor.catalog)
      expect(await page.evaluate(() => ({ imports: (window as any).__SOURCE_IMPORTS__, app: !!document.querySelector('#app'), frames: window.frames.length }))).toEqual({ imports: undefined, app: false, frames: 0 })
      await writeFile(join(fixture.root, 'Book.story.md'), '# Changed source documentation')
      await expect.poll(async () => (await readEmbedBrowserSource(page)).descriptor.revision, { timeout: 15_000 }).not.toBe(devDescriptor.revision)
      const changed = (await readEmbedBrowserSource(page)).descriptor
      const docs = await fetch(new URL(changed.assets.content.find(entry => entry.storyId === 'overlap').docs, dev.url)).then(response => response.json())
      expect(docs.body).toContain('Changed source documentation')
      for (const document of ['index.html', '__sandbox.html', '__embed.html', 'assets/histoire-embed-source-expired.json']) {
        const response = await fetch(new URL(document, dev.url))
        expect(response.headers.get('content-security-policy')).toBe('frame-ancestors \'self\' https://baked.test')
      }
      await dev.close()
      const build = await project.build()
      await cp(build.outDir, copied.root, { recursive: true })
      const app = connect().use('/book/', sirv(copied.root, { dev: true }))
      staticServer = createServer(app)
      const origin = await listenOwnedServer(staticServer, 0, '127.0.0.1')
      const url = `${origin}/book/__embed.html?view=bridge`
      await page.goto(url)
      const staticSource = await readEmbedBrowserSource(page)
      expect(staticSource.descriptor.mode).toBe('static')
      expect(staticSource.descriptor.catalog).toEqual(changed.catalog)
      expect(staticSource.descriptor.capabilities.serverTests.available).toBe(false)
      expect(staticSource.allowedOrigins).toEqual(['https://baked.test'])
      expect(await page.evaluate(() => (window as any).__SOURCE_IMPORTS__)).toBeUndefined()
      await writeFile(join(copied.root, 'histoire-embed-origins.json'), JSON.stringify({ version: 1, allowedOrigins: ['https://deployed.test'] }))
      await page.goto(url)
      expect((await readEmbedBrowserSource(page)).allowedOrigins).toEqual(['https://deployed.test'])
      await writeFile(join(copied.root, 'histoire-embed-origins.json'), '{bad')
      await page.goto(url)
      expect((await readEmbedBrowserSource(page)).allowedOrigins).toEqual([])
      expect(errors).toEqual([])
      expect(await readFile(join(copied.root, 'index.html'), 'utf8')).toContain('bundle-main')
      expect(await readFile(join(copied.root, '__sandbox.html'), 'utf8')).toContain('bundle-sandbox')
    }
    finally {
      await page.close()
      await browser.close()
      if (staticServer) await closeOwnedServer(staticServer)
      await project?.close()
      await copied.close()
      await fixture.close()
    }
  })
})
