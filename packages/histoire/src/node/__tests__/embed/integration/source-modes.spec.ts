import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { launchEmbedBrowser, readEmbedBrowserSource } from '../../utils/embed/browser.js'
import { createEmbedSourceDevelopment } from '../../utils/embed/source-development.js'
import { createEmbedVueProject } from '../../utils/embed/vue-project.js'
import { assertMcpProcessReleased } from '../../utils/mcp/process.js'

describe('source document mode boundaries', () => {
  it('keeps default-disabled dev/build artifacts and framing policy unchanged', async () => {
    const fixture = await createEmbedVueProject('Disabled book')
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    try {
      await fixture.setTitle('Disabled book')
      await writeFile(join(fixture.root, 'custom.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins:[HstVue()],storyMatch:['*.story.vue'],collectMaxThreads:1,mcp:false }`)
      await writeFile(join(fixture.root, 'vite.config.ts'), (await readFile(join(fixture.root, 'vite.config.ts'), 'utf8')).replace('open:false', `open:false,headers:{'Content-Security-Policy':"script-src 'self'"}`))
      project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
      const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
      await dev.ready
      for (const document of ['__embed.html', 'histoire-embed.json']) {
        const response = await fetch(new URL(document, dev.url))
        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
        expect(response.headers.get('content-security-policy')).toBe('script-src \'self\'')
      }
      for (const document of ['index.html', '__sandbox.html']) {
        const response = await fetch(new URL(document, dev.url))
        expect(response.status).toBe(200)
        expect(response.headers.get('content-security-policy')).toBe('script-src \'self\'')
      }
      await dev.close()
      const build = await project.build()
      const files = await readdir(build.outDir, { recursive: true })
      expect(files.filter(file => file.includes('embed'))).toEqual([])
      expect(files).toEqual(expect.arrayContaining(['index.html', '__sandbox.html', 'histoire.json']))
    }
    finally {
      await project?.close()
      await fixture.close()
    }
  })

  it('boots source-development entry with same lazy descriptor and no host story import', async () => {
    const fixture = await createEmbedVueProject('Source mode')
    const browser = await launchEmbedBrowser()
    const page = await browser.newPage()
    let child: Awaited<ReturnType<typeof createEmbedSourceDevelopment>> | undefined
    let url: string | undefined
    try {
      await fixture.setTitle('Source mode')
      await writeFile(join(fixture.root, 'custom.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins:[HstVue()],storyMatch:['*.story.vue'],collectMaxThreads:1,mcp:false,embed:{enabled:true} }`)
      const story = join(fixture.root, 'Book.story.vue')
      await writeFile(story, `<script>if(typeof window!=='undefined')window.__SOURCE_IMPORTS__=true</script>${await readFile(story, 'utf8')}`)
      child = await createEmbedSourceDevelopment(fixture.root, 'custom.ts')
      url = child.url
      const html = await fetch(new URL('__embed.html?view=bridge', url)).then(response => response.text())
      expect(html).toContain('bundle-embed-dev.js')
      await page.goto(new URL('__embed.html?view=bridge', url).href)
      let source: Awaited<ReturnType<typeof readEmbedBrowserSource>>
      try {
        source = await readEmbedBrowserSource(page)
      }
      catch (error) {
        // Vite's first dependency optimization may retire this source document.
        // Explicit test-owned navigation reads metadata only; no story is replayed.
        expect(String(error)).toContain('Execution context was destroyed')
        await page.reload()
        source = await readEmbedBrowserSource(page)
      }
      expect(source.descriptor.catalog.stories[0]).toMatchObject({ id: 'overlap', title: 'Source mode' })
      expect(await page.evaluate(() => ({ imported: (window as any).__SOURCE_IMPORTS__, frames: window.frames.length, app: !!document.querySelector('#app') }))).toEqual({ imported: undefined, frames: 0, app: false })
    }
    finally {
      await page.close()
      await browser.close()
      await child?.close()
      if (child && url) await assertMcpProcessReleased(child.process, url)
      await fixture.close()
    }
  })
})
