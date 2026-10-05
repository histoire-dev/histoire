import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import sirv from 'sirv'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { createMcpProjectFixture } from '../mcp/project.js'
import { launchEmbedBrowser } from './browser.js'
import { createEmbedHosts } from './hosts.js'
import { createEmbedSourceDevelopment } from './source-development.js'
import { createEmbedVueProject } from './vue-project.js'
/** Three real origins plus built SDK/book; fixture closes only its owned servers/resources. */
export async function createEmbedBridgeFixture(options: {
  /** Optional real story for surface/runtime conformance. */
  story?: string
  /** Explicit additional origin authority for server test gate. */
  allowServerTests?: boolean
  /** Explicit application namespaces; default fixture grants no host-channel authority. */
  channels?: string[]
  /** Setup hooks run through existing support plugin. */
  setup?: string
  /** Additional trusted fixture-only Histoire configuration. */
  config?: string
  /** Optional native consumer document; same owned host lifecycle as SDK fixtures. */
  hostHtml?: string
  /** Finite in-memory host assets; no filesystem or CORS proxy routes. */
  hostModules?: Record<string, { body: string, contentType?: string }>
  /** Dev mode exercises real collection/HMR; static remains default. */
  mode?: 'dev' | 'static' | 'source-dev'
  /** Standalone gates exercise default-disabled external embedding with same real book/hosts. */
  embedding?: boolean
  /** Copy public book into unrelated deployment directory before serving. */
  copiedOutput?: boolean
  /** Performance runs retain warm HTTP cache; ordinary gates stay uncached. */
  staticCache?: boolean
  /** Trusted fixture modules such as mocked story dependencies. */
  files?: Record<string, string>
} = {}) {
  const fixture = await createEmbedVueProject('Bridge book')
  const servers: ReturnType<typeof createServer>[] = []
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
  let hosts: Awaited<ReturnType<typeof createEmbedHosts>> | undefined
  let sourceDevelopment: Awaited<ReturnType<typeof createEmbedSourceDevelopment>> | undefined
  let copied: Awaited<ReturnType<typeof createMcpProjectFixture>> | undefined
  try {
    hosts = await createEmbedHosts({ html: options.hostHtml, modules: options.hostModules })
    const { hostOrigin, deniedOrigin } = hosts
    await fixture.setTitle('Bridge book')
    const storyPath = join(fixture.root, 'Book.story.vue')
    await writeFile(storyPath, options.story ?? `<script>if (typeof window !== 'undefined') window.__SOURCE_IMPORTS__ = (window.__SOURCE_IMPORTS__ || 0) + 1</script>${await readFile(storyPath, 'utf8')}`)
    if (options.setup) await writeFile(join(fixture.root, 'setup.ts'), options.setup)
    for (const [name, content] of Object.entries(options.files ?? {})) {
      const path = join(fixture.root, name)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content)
    }
    await writeFile(join(fixture.root, 'custom.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins:[HstVue()], storyMatch:['*.story.vue'], collectMaxThreads:1, mcp:false, ${options.setup ? 'setupFile:\'./setup.ts\',' : ''} ${options.config ?? ''} embed:{enabled:${options.embedding !== false},channels:${JSON.stringify(options.channels ?? [])},allowServerTests:${options.allowServerTests === true},allowedOrigins:[${JSON.stringify(hostOrigin)}]} }`)
    let bookUrl: string
    if (options.mode === 'source-dev') {
      sourceDevelopment = await createEmbedSourceDevelopment(fixture.root, 'custom.ts')
      bookUrl = sourceDevelopment.url
    }
    else if (options.mode === 'dev') {
      project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
      const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
      await dev.ready
      bookUrl = dev.url
    }
    else {
      project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
      const built = await project.build()
      if (options.copiedOutput) {
        copied = await createMcpProjectFixture()
        await cp(built.outDir, copied.root, { recursive: true })
      }
      const bookServer = createServer(hosts.application().use('/book/', sirv(copied?.root ?? built.outDir, options.staticCache ? { maxAge: 3600, etag: true } : { dev: true })))
      servers.push(bookServer)
      bookUrl = `${await listenOwnedServer(bookServer, 0, '127.0.0.1')}/book/`
    }
    const bookOrigin = new URL(bookUrl).origin
    browser = await launchEmbedBrowser()
    return {
      browser,
      hostOrigin,
      deniedOrigin,
      bookOrigin,
      bookUrl,
      root: fixture.root,
      /** Actual public artifact root for deployment-independent assertions. */
      outputRoot: copied?.root,
      /** Owned subprocess diagnostics only, for source-development fixture failures. */
      diagnostics: () => sourceDevelopment?.output() ?? '',
      /** Close browser first to observe pagehide/port cleanup before listener release. */
      async close() {
        await browser?.close()
        for (const server of servers.reverse()) {
          await closeOwnedServer(server)
        }
        await project?.close()
        await sourceDevelopment?.close()
        await hosts?.close()
        await copied?.close()
        await fixture.close()
      },
    }
  }
  catch (error) {
    await browser?.close()
    for (const server of servers.reverse()) {
      await closeOwnedServer(server)
    }
    await project?.close()
    await sourceDevelopment?.close()
    await hosts?.close()
    await copied?.close()
    await fixture.close()
    throw error
  }
}
