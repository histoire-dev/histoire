import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { expect, it, vi } from 'vitest'
import { getProjectServices } from '../../../../../dist/node/api/internal.js'
import { createHistoireTestCollectionTask } from '../../../../../dist/node/test/execution-service.js'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createMcpBrowserTestProject } from '../../utils/mcp/browser-test-project.js'
import { TEST_DISCOVERY_FACTS } from '../../utils/mcp/test-discovery-observer.js'

/** Registration names depend on both watched source and an external setup response. */
function story(origin: string, id: string, variant = 'main') {
  return `<script setup lang="ts">
import {onTest} from 'histoire/client';import {it} from 'vitest';import {suffix} from './helper';
let label='';async function setup(){label=await(await fetch('${origin}/${id}')).text()}
onTest(()=>{if(!label)return;if(label==='broken')throw new Error('Registration failed');it(label+suffix,()=>{})})
</script><template><Story id="${id}" title="${id}"><Variant id="${variant}" :setup-app="setup"><button>${id}</button></Variant></Story></template>`
}

it('reuses cleaned-up definitions across reloads and tabs, refreshes explicitly, and invalidates watched dependencies', async () => {
  // Real task/worker/browser boundary. Extra mounts expose a missing cache;
  // changed names expose stale cache. Assertion execution remains independent.
  const fixture = await createMcpBrowserTestProject()
  const effects: string[] = []
  let label = 'first'
  const marker = createServer((request, response) => {
    effects.push(request.url!)
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.end(label)
  })
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
  try {
    const origin = await listenOwnedServer(marker, 0, '127.0.0.1')
    await writeFile(resolve(fixture.root, 'helper.ts'), `export const suffix=' one'`)
    await writeFile(resolve(fixture.root, 'Book.story.vue'), story(origin, 'alpha'))
    await writeFile(resolve(fixture.root, 'Beta.story.vue'), story(origin, 'beta'))
    project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
    await dev.ready
    const services = getProjectServices(project)
    /** Always capture the current generation after config restarts. */
    const context = () => services.dev!.controller.current!.context
    /** Native server collection uses the same lane as browser requests. */
    const collect = (force = false) => services.execution.enqueue(createHistoireTestCollectionTask(context(), { force })).result
    /** Independent literal expectations protect all admitted stories. */
    function names(result: Awaited<ReturnType<typeof collect>>) {
      expect(result.variants.map(entry => entry.target.storyId).sort()).toEqual(['alpha', 'beta', 'empty'])
      expect(result.variants.every(entry => !entry.collection.error)).toBe(true)
      expect(result.variants.map(entry => entry.collection.definitions.length).sort()).toEqual([0, 1, 1])
      return result.variants.filter(entry => entry.target.storyId !== 'empty').map(entry => entry.collection.definitions[0].name)
    }
    effects.length = 0
    const first = await collect()
    expect(names(first)).toEqual(['first one', 'first one'])
    expect(effects).toEqual(expect.arrayContaining(['/alpha', '/beta']))
    first.variants.find(entry => entry.target.storyId === 'alpha')!.collection.definitions[0].name = 'consumer mutation'
    const mounts = effects.length
    label = 'second'
    const started = performance.now()
    const cached = await collect()
    expect(names(cached)).toEqual(['first one', 'first one'])
    expect(cached.execution.runId).not.toBe(first.execution.runId)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(effects).toHaveLength(mounts)
    await expect(services.execution.enqueue(createHistoireTestCollectionTask(context(), { force: 'true' as unknown as boolean })).result).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(effects).toHaveLength(mounts)

    browser = await launchEmbedBrowser()
    const page = await browser.newPage()
    const operations: string[] = []
    /** Reloads and peer tabs receive fresh operation identity even when every definition is cached. */
    function observe(target: typeof page) {
      target.on('websocket', socket => socket.on('framereceived', (frame) => {
        const message = JSON.parse(String(frame.payload))
        if (message.event === 'histoire:dev-event-result' && message.data?.event === 'collectStoryTests' && message.data.result) operations.push(message.data.result.execution.runId)
      }))
    }
    observe(page)
    await page.addInitScript(`localStorage.setItem('_histoire-ui-shell',JSON.stringify({pane:'tests',panelOpen:true}))`)
    /** Wait for published definitions, not merely spinner removal. */
    async function ready(target = page) {
      await target.waitForFunction(`(${TEST_DISCOVERY_FACTS})()?.status==='completed'`)
      await target.getByRole('button', { name: 'All', exact: true }).click()
      expect(await target.locator('.test-row').count()).toBe(2)
    }
    await page.goto(dev.url)
    await ready()
    const reload = performance.now()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await ready()
    expect(performance.now() - reload).toBeLessThan(2000)
    const peer = await browser.newPage()
    observe(peer)
    await peer.addInitScript(`localStorage.setItem('_histoire-ui-shell',JSON.stringify({pane:'tests',panelOpen:true}))`)
    await peer.goto(dev.url)
    await ready(peer)
    expect(operations).toHaveLength(3)
    expect(new Set(operations).size).toBe(3)
    expect(effects).toHaveLength(mounts)
    await page.getByRole('button', { name: 'Refresh tests', exact: true }).click()
    await ready()
    expect(names(await collect())).toEqual(['second one', 'second one'])
    expect(effects.length).toBeGreaterThan(mounts)

    await writeFile(resolve(fixture.root, 'helper.ts'), `export const suffix=' two'`)
    await vi.waitFor(() => expect(services.dev!.catalog!.updating).toBe(false))
    await vi.waitFor(async () => expect(names(await collect())).toEqual(['second two', 'second two']), { timeout: 15_000 })
    await writeFile(resolve(fixture.root, 'Book.story.vue'), story(origin, 'alpha', 'replacement'))
    await vi.waitFor(() => expect(context().storyFiles.find(file => file.story?.id === 'alpha')?.story?.variants[0].id).toBe('replacement'))
    await vi.waitFor(() => expect(services.dev!.catalog!.updating).toBe(false))
    const changed = await collect()
    expect(names(changed)).toEqual(['second two', 'second two'])
    expect(changed.variants.find(entry => entry.target.storyId === 'alpha')!.target.variantId).toBe('replacement')
    label = 'broken'
    const failed = await collect(true)
    expect(failed.variants.filter(entry => entry.collection.error).map(entry => entry.target.storyId).sort()).toEqual(['alpha', 'beta'])
    label = 'recovered'
    expect(names(await collect())).toEqual(['recovered two', 'recovered two'])
    expect(await project.runTests({ storyId: 'alpha', variantId: 'replacement' })).toMatchObject({ passed: 1, failed: 0 })
    await browser.close()
    browser = undefined
    const epoch = services.dev!.controller.current!.epoch
    label = 'after restart'
    await writeFile(resolve(fixture.root, 'setup.ts'), `import {onTest} from 'histoire/client';import {it} from 'vitest';onTest(()=>it('shared one',()=>{}))`)
    await writeFile(resolve(fixture.root, 'custom config.ts'), `import {HstVue} from '@histoire/plugin-vue';export default {plugins:[HstVue()],storyMatch:['*.story.vue'],setupFile:'setup.ts',mcp:false,test:{collectTimeout:60000,runTimeout:60000}}`)
    await vi.waitFor(() => {
      expect(services.dev!.controller.current?.epoch).not.toBe(epoch)
      expect(services.dev!.catalog?.updating).toBe(false)
    }, { timeout: 10_000 })
    /** Global setup registration affects empty variants too, without losing story registrations. */
    function sharedNames(result: Awaited<ReturnType<typeof collect>>, shared: string, registered = 'after restart two') {
      expect(result.variants.map(entry => entry.target.storyId).sort()).toEqual(['alpha', 'beta', 'empty'])
      for (const entry of result.variants) {
        expect(entry.collection.error).toBeUndefined()
        expect(entry.collection.definitions.map(definition => definition.name).sort()).toEqual(entry.target.storyId === 'empty' ? [shared] : [registered, shared].sort())
      }
    }
    sharedNames(await collect(), 'shared one')
    await writeFile(resolve(fixture.root, 'setup.ts'), `import {onTest} from 'histoire/client';import {it} from 'vitest';onTest(()=>it('shared two',()=>{}))`)
    await vi.waitFor(async () => sharedNames(await collect(), 'shared two'), { timeout: 15_000 })
    await writeFile(resolve(fixture.root, 'opaque.ts'), 'export const value=true')
    await writeFile(resolve(fixture.root, 'helper.ts'), `export const suffix=' two';const path='./opaque.ts';void import(/* @vite-ignore */path)`)
    label = 'opaque first'
    await vi.waitFor(async () => sharedNames(await collect(), 'shared two', 'opaque first two'), { timeout: 15_000 })
    const opaqueMounts = effects.length
    label = 'opaque second'
    sharedNames(await collect(), 'shared two', 'opaque second two')
    expect(effects.length).toBeGreaterThan(opaqueMounts)
    const dependency = resolve(fixture.root, 'node_modules/unobserved-registration')
    await mkdir(dependency)
    await writeFile(resolve(dependency, 'package.json'), '{"name":"unobserved-registration","type":"module","exports":"./index.js"}')
    await writeFile(resolve(dependency, 'index.js'), `export const suffix=' two'`)
    await writeFile(resolve(fixture.root, 'helper.ts'), `export {suffix} from 'unobserved-registration'`)
    label = 'unobserved first'
    await vi.waitFor(async () => sharedNames(await collect(), 'shared two', 'unobserved first two'), { timeout: 15_000 })
    label = 'unobserved second'
    sharedNames(await collect(), 'shared two', 'unobserved second two')
    await rm(resolve(fixture.root, 'Beta.story.vue'))
    await vi.waitFor(() => expect(context().storyFiles.some(file => file.story?.id === 'beta')).toBe(false))
    await vi.waitFor(() => expect(services.dev!.catalog!.updating).toBe(false))
    expect((await collect()).variants.map(entry => entry.target.storyId).sort()).toEqual(['alpha', 'empty'])
  }
  finally {
    await browser?.close()
    await project?.close()
    await closeOwnedServer(marker)
    await fixture.close()
  }
}, 120_000)
