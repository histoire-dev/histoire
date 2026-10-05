import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createEmbedHosts } from '../../utils/embed/hosts.js'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'

describe('isolated Svelte preview engine', () => {
  it('updates store globals without remount and retains separate grid state', async () => {
    const fixture = await createMcpFrameworkProject('svelte4')
    const hosts = await createEmbedHosts()
    const browser = await launchEmbedBrowser()
    const page = await browser.newPage()
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    try {
      await writeFile(join(fixture.root, 'histoire.config.ts'), `import {HstSvelte} from '@histoire/plugin-svelte';export default {plugins:[HstSvelte()],storyMatch:['Isolated.story.svelte'],collectMaxThreads:1,mcp:false,preview:{globals:{token:'default'}},embed:{enabled:true,allowedOrigins:[${JSON.stringify(hosts.hostOrigin)}]}}`)
      await writeFile(join(fixture.root, 'Isolated.story.svelte'), `<script>import {useHistoireGlobalsStore} from 'histoire/client';export let Hst;const globals=useHistoireGlobalsStore();let count=4</script><Hst.Story id="svelte-isolated" layout={{type:'grid',width:250}}><Hst.Variant id="one"><button on:click={()=>count++}>one:{count}:{$globals.token}</button></Hst.Variant><Hst.Variant id="two"><button on:click={()=>count++}>two:{count}:{$globals.token}</button></Hst.Variant></Hst.Story>`)
      project = await createHistoireProject({ root: fixture.root })
      await project.build()
      const server = await project.preview({ host: '127.0.0.1', port: 0 })
      await server.ready
      await page.goto(`${hosts.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(server.url)}});await session.connect();await session.selection.select({storyId:'svelte-isolated',variantId:'one'});window.primary=session.mount(document.querySelector('#mount'),{surface:'grid'});await primary.ready})()`)
      const sandbox = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      await expect.poll(() => sandbox.getByRole('button', { name: /^one:/ }).textContent()).toBe('one:4:default')
      const documentId = await page.evaluate('session.getSnapshot().runtime.runtimeId')
      await page.evaluate('session.settings.update({globals:{token:"changed"}})')
      await expect.poll(() => sandbox.getByRole('button', { name: /^one:/ }).textContent()).toBe('one:4:changed')
      expect(await sandbox.getByRole('button', { name: /^two:/ }).textContent()).toBe('two:4:changed')
      await page.evaluate('session.state.patch({count:8})')
      await expect.poll(() => sandbox.getByRole('button', { name: /^one:/ }).textContent()).toBe('one:8:changed')
      expect(await sandbox.getByRole('button', { name: /^two:/ }).textContent()).toBe('two:4:changed')
      expect(await page.evaluate('session.getSnapshot().runtime.runtimeId')).toBe(documentId)
      await page.evaluate('session.dispose()')
    }
    finally {
      await page.close()
      await project?.close()
      await browser.close()
      await hosts.close()
      await fixture.close()
    }
  })
})
