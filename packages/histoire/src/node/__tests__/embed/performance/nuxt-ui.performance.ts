import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import connect from 'connect'
import { createHistoireProject } from 'histoire/node'
import sirv from 'sirv'
import { describe, expect, it } from 'vitest'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createEmbedHosts } from '../../utils/embed/hosts.js'
import { measureCapturePerformance, measureEmbedPerformance, recordEmbedPerformance } from '../../utils/embed/performance.js'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'
import { closeMcpFixtures } from '../../utils/mcp/process.js'

describe('dedicated factory Nuxt UI performance baseline', () => {
  it('records public browser and Node latency with actual Nuxt UI/Tailwind/rstore example', async () => {
    const cleanup: (() => Promise<unknown>)[] = []
    try {
      const hosts = await createEmbedHosts()
      cleanup.push(hosts.close)
      const fixture = await createMcpFrameworkProject('nuxt-ui')
      cleanup.push(fixture.close)
      const storyPath = resolve(fixture.root, 'app/components/Fixture.story.vue')
      const source = await readFile(storyPath, 'utf8')
      // Only copied performance fixture gains second target. It renders exact
      // same real Nuxt UI/rstore component, so variant-switch metric is valid.
      await writeFile(storyPath, source.replace('</Story>', '<Variant id="alternate" title="Alternate fixture"><FixtureCard /></Variant></Story>'))
      await writeFile(resolve(fixture.root, 'performance.config.ts'), `import config from './histoire.config';export default {...config,collectMaxThreads:1,mcp:false,embed:{enabled:true,allowedOrigins:[${JSON.stringify(hosts.hostOrigin)}]}}`)
      const project = await createHistoireProject({ root: fixture.root, configFile: 'performance.config.ts' })
      cleanup.push(() => project.close())
      const built = await project.build()
      const server = createServer(connect().use('/_stories/', sirv(built.outDir, { maxAge: 3600, etag: true })))
      cleanup.push(() => closeOwnedServer(server))
      const origin = await listenOwnedServer(server, 0, '127.0.0.1')
      const browser = await launchEmbedBrowser()
      cleanup.push(() => browser.close())
      const page = await browser.newPage()
      cleanup.push(() => page.close())
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${hosts.hostOrigin}/host.html`)
      const measurements = await measureEmbedPerformance(page, { bookUrl: `${origin}/_stories/`, storyId: 'nuxt-ui-rstore', variantIds: ['main', 'alternate'], samples: 20 })
      const descriptor = await readFile(resolve(built.outDir, 'histoire-embed.json'))
      const catalog = JSON.parse(descriptor.toString()).catalog.stories
      expect(catalog.find(story => story.id === 'nuxt-ui-rstore').variants.map(variant => variant.id)).toEqual(['main', 'alternate'])
      const preview = await project.preview({ host: '127.0.0.1', port: 0 })
      await preview.ready
      const capture = await measureCapturePerformance(project, { storyId: 'nuxt-ui-rstore', variantId: 'main' }, 20)
      const report = await recordEmbedPerformance({ browser: measurements, capture, descriptor, browserVersion: browser.version(), fixture: { name: 'Nuxt UI4/Tailwind4/rstore example; copied fixture adds same-component alternate variant', stories: catalog.length, variants: catalog.reduce((count, story) => count + story.variants.length, 0) }, sampleCount: 20, outputPath: '/tmp/histoire-sdk16-performance-nuxt-ui.json' })
      expect(report.sampleCount).toBe(20)
      expect(await page.locator('iframe').count()).toBe(0)
      expect(errors).toEqual([])
    }
    finally { await closeMcpFixtures(cleanup) }
  })
})
