import { cp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import connect from 'connect'
import { createHistoireProject } from 'histoire/node'
import sirv from 'sirv'
import { describe, expect, it } from 'vitest'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createEmbedHosts } from '../../utils/embed/hosts.js'
import { attemptEmbedPrimary } from '../../utils/embed/primary-session.js'
import { copyMcpArtifact } from '../../utils/mcp/artifact-project.js'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'
import { closeMcpFixtures, startMcpProcess } from '../../utils/mcp/process.js'
import { createMcpProjectFixture } from '../../utils/mcp/project.js'

describe('nuxt UI 4, Tailwind 4 and local rstore consumer', () => {
  it('renders isolated queries, Nuxt composables and toast in dev/copied static/Node books under nested base', async () => {
    const cleanup: (() => Promise<unknown>)[] = []
    try {
      const hosts = await createEmbedHosts({ html: '<!doctype html><div id="mount" style="width:720px;height:560px"></div><div id="second" style="width:720px;height:560px"></div>' })
      cleanup.push(hosts.close)
      const fixture = await createMcpFrameworkProject('nuxt-ui')
      cleanup.push(fixture.close)
      await writeFile(resolve(fixture.root, 'embed.config.ts'), `import config from './histoire.config'; export default {...config, collectMaxThreads:1, mcp:false, embed:{enabled:true,allowedOrigins:[${JSON.stringify(hosts.hostOrigin)}]}}`)
      await writeFile(resolve(fixture.root, 'embed.node.config.ts'), `import config from './embed.config'; export default {...config,build:{target:'node'}}`)
      const browser = await launchEmbedBrowser()
      cleanup.push(() => browser.close())
      const page = await browser.newPage()
      const errors: string[] = []
      const external: string[] = []
      page.on('pageerror', error => errors.push(error.stack ?? error.message))
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(url.href)
      })
      /** Same browser SDK consumer proves source modes without importing Nuxt into host. */
      async function inspect(bookUrl: string, mode: string): Promise<void> {
        expect(new URL(bookUrl).pathname).toBe('/_stories/')
        await page.goto(`${hosts.hostOrigin}/host.html`)
        await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(bookUrl)}});await session.connect();window.catalog=await session.catalog.list()})()`)
        expect(await page.evaluate('catalog.find(story=>story.id==="nuxt-ui-rstore").variants.map(variant=>variant.id)')).toEqual(['main'])
        expect(page.frames().filter(frame => frame.url().includes('__sandbox.html'))).toHaveLength(0)
        const target = { storyId: 'nuxt-ui-rstore', variantId: 'main' }
        const cold = await attemptEmbedPrimary(page, bookUrl, target, 'preview', { reuseSession: true })
        if (cold) {
          expect({ mode, cold, errors }).toEqual({ mode: 'dev', cold: { code: 'NOT_CONNECTED', status: 'disconnected', stale: true }, errors: [] })
          await page.evaluate('session.dispose()')
          // Caller requests a fresh session after optimizer reload. SDK itself
          // never replays selection, state changes, tests or a failed mount.
          const fresh = await attemptEmbedPrimary(page, bookUrl, target, 'preview')
          expect({ fresh, errors }).toEqual({ fresh: null, errors: [] })
        }
        const sandbox = () => page.frames().find(frame => frame.url().includes('__sandbox.html'))!
        await expect.poll(() => sandbox().getByRole('list', { name: 'Fixture items' }).getByRole('listitem').allTextContents(), { timeout: 30_000 }).toEqual(['First item', 'Second item'])
        expect(await sandbox().getByRole('heading', { name: 'Local fixture' }).count()).toBe(1)
        await sandbox().getByRole('button', { name: 'Show toast' }).click()
        await expect.poll(() => sandbox().getByText('2 local items', { exact: true }).count()).toBeGreaterThan(0)
        await page.evaluate('session.settings.update({colorScheme:"dark"})')
        await sandbox().locator('body').screenshot({ animations: 'disabled', path: `/tmp/histoire-sdk-nuxt-ui-${mode}-dark.png` })
        await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.second=createHistoireSession({url:${JSON.stringify(bookUrl)}});await second.connect();await second.settings.update({colorScheme:'light'});await second.selection.select({storyId:'nuxt-ui-rstore',variantId:'main'});window.other=second.mount(document.querySelector('#second'),{surface:'preview'});await other.ready})()`)
        const other = page.frames().filter(frame => frame.url().includes('__sandbox.html'))[1]
        await expect.poll(() => other.getByRole('list', { name: 'Fixture items' }).getByRole('listitem').allTextContents()).toEqual(['First item', 'Second item'])
        expect(await page.evaluate('[session.getSnapshot().settings.colorScheme,second.getSnapshot().settings.colorScheme]')).toEqual(['dark', 'light'])
        await other.locator('body').screenshot({ animations: 'disabled', path: `/tmp/histoire-sdk-nuxt-ui-${mode}-light.png` })
        await page.evaluate('Promise.all([session.dispose(),second.dispose()])')
        expect(await page.locator('iframe').count()).toBe(0)
        expect(errors).toEqual([])
        expect(external).toEqual([])
      }
      const project = await createHistoireProject({ root: fixture.root, configFile: 'embed.config.ts' })
      cleanup.push(() => project.close())
      const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
      await dev.ready
      await inspect(dev.url, 'dev')
      await dev.close()
      const built = await project.build()
      const copied = await createMcpProjectFixture()
      cleanup.push(copied.close)
      await cp(built.outDir, copied.root, { recursive: true })
      const server = createServer(connect().use('/_stories/', sirv(copied.root, { dev: true })))
      cleanup.push(() => closeOwnedServer(server))
      const origin = await listenOwnedServer(server, 0, '127.0.0.1')
      await inspect(`${origin}/_stories/`, 'static')
      await project.close()
      const node = await createHistoireProject({ root: fixture.root, configFile: 'embed.node.config.ts' })
      cleanup.push(() => node.close())
      await node.build()
      await node.close()
      const portable = await copyMcpArtifact(fixture.root)
      cleanup.push(portable.close)
      await fixture.close()
      const deployed = startMcpProcess([], portable.unrelated, { HOST: '127.0.0.1', PORT: '0' }, resolve(portable.artifact, 'server.mjs'))
      cleanup.push(() => deployed.close())
      const bookUrl = (await deployed.waitFor(/Histoire book: (http:\/\/\S+)/, 60_000))[1]
      await inspect(bookUrl, 'node')
    }
    finally { await closeMcpFixtures(cleanup) }
  }, 240_000)
})
