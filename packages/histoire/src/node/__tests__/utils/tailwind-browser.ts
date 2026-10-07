import { createServer } from 'node:http'
import { createHistoireProject } from 'histoire/node'
import sirv from 'sirv'
import { closeOwnedServer, listenOwnedServer } from '../../runtime/hosting/listener.js'
import { launchEmbedBrowser } from './embed/browser.js'
import { createEmbedHosts } from './embed/hosts.js'
import { createTailwindFixture } from './tailwind.js'

/** Real token book reuses canonical project, host, browser and cleanup fixtures. */
export async function createTailwindBook(version: 3 | 4, mode: 'dev' | 'static') {
  const fixture = await createTailwindFixture(version, true)
  let hosts: Awaited<ReturnType<typeof createEmbedHosts>> | undefined
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
  let server: ReturnType<typeof createServer> | undefined
  /** Release browser consumers before captured runtime and project inputs. */
  async function close() {
    await browser?.close()
    if (server) await closeOwnedServer(server)
    await project?.close()
    await hosts?.close()
    await fixture.close()
  }
  try {
    hosts = await createEmbedHosts({ html: '<!doctype html><div id="mount" style="width:640px;height:480px"></div><div id="controls" style="width:400px;height:240px"></div><div id="second" style="width:400px;height:300px"></div>' })
    await fixture.write('vite.config.ts', `export default {base:'/',optimizeDeps:{noDiscovery:true,exclude:['msw/browser','msw/core/http']},server:{host:'127.0.0.1',open:false,hmr:{port:0}}}`)
    await fixture.write('histoire.config.ts', `export default {routerMode:'hash',storyMatch:[],mcp:false,collectMaxThreads:1,embed:{enabled:true,allowedOrigins:[${JSON.stringify(hosts.hostOrigin)}]}}`)
    if (version === 3) {
      await fixture.write('tailwind.config.cjs', `module.exports={prefix:'ac-',theme:{colors:{brand:'#123456'},fontSize:{lg:['20px',{lineHeight:'1.5'}]},fontFamily:{sans:[['Inter','sans-serif'],{fontFeatureSettings:'"cv11"',fontVariationSettings:'"wght" 650'}]}}}`)
    }
    else {
      await fixture.write('colors.css', '@theme { --color-*: initial; --color-brand: var(--brand); --text-lg: 20px; --text-lg--line-height: 1.5; } @layer base { :root { --brand: #123456; } :root.dark { --brand: #654321; } }')
      await fixture.write('main.css', '@import "tailwindcss"; @import "./colors.css";')
      await fixture.write('admin.css', '@import "tailwindcss"; @theme { --color-*: initial; --color-brand: #abcdef; }')
    }
    project = await createHistoireProject({ root: fixture.root })
    let bookUrl: string
    let catalog: any
    if (mode === 'dev') {
      const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
      await dev.ready
      bookUrl = dev.url!
      catalog = project.getSnapshot().dev!.catalog
    }
    else {
      const built = await project.build()
      server = createServer(sirv(built.outDir, { dev: true }))
      bookUrl = `${await listenOwnedServer(server, 0, '127.0.0.1')}/`
      catalog = (await fetch(new URL('histoire-embed.json', bookUrl)).then(response => response.json())).catalog
    }
    browser = await launchEmbedBrowser()
    return { ...fixture, browser, project, hosts, bookUrl, catalog, close }
  }
  catch (error) {
    await close()
    throw error
  }
}
