import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { expect, it } from 'vitest'
import { getProjectServices } from '../../../../../dist/node/api/internal.js'
import { createHistoireTestCollectionTask } from '../../../../../dist/node/test/execution-service.js'
import { createEmbedDescriptor } from '../../../../../dist/node/virtual/embed/descriptor.js'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createMcpBrowserTestProject } from '../../utils/mcp/browser-test-project.js'
import { createTestDiscoveryPane } from '../../utils/mcp/test-discovery-pane.js'

it('discovers variant-dependent definitions in real browser without running assertion bodies or hooks', async () => {
  const fixture = await createMcpBrowserTestProject()
  const effects: string[] = []
  const marker = createServer((request, response) => {
    effects.push(request.url!)
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.end('recorded')
  })
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  try {
    const origin = await listenOwnedServer(marker, 0, '127.0.0.1')
    await writeFile(resolve(fixture.root, 'Book.story.vue'), `<script lang="ts">
import { onTest } from 'histoire/client'
import { beforeAll, beforeEach, afterEach, afterAll, it } from 'vitest'
onTest(({ variant }) => {
  if (variant.id === 'empty') return
  if (variant.id === 'broken') throw new Error('Registration failed')
  if (variant.id === 'skipped') { it.skip('skipped only', () => { throw new Error('Skipped body executed') }); return }
  if (variant.id === 'todo') { it.todo('todo only'); return }
  beforeAll(() => fetch('${origin}/beforeAll'))
  beforeEach(() => fetch('${origin}/beforeEach'))
  afterEach(() => fetch('${origin}/afterEach'))
  afterAll(() => fetch('${origin}/afterAll'))
  it('body', () => fetch('${origin}/body'))
  it.skip('skipped', () => { throw new Error('Skipped body executed') })
  it.todo('todo')
})
</script><template><Story id="test-book" title="Test book"><Variant id="tested" title="Tested"><button>Tested</button></Variant><Variant id="empty" title="Empty sibling"><span>Empty</span></Variant><Variant id="broken" title="Broken"><span>Broken</span></Variant><Variant id="skipped" title="Skipped only"><span>Skipped</span></Variant><Variant id="todo" title="Todo only"><span>Todo</span></Variant></Story></template>`)
    await writeFile(resolve(fixture.root, 'Empty.story.vue'), '<template><Story id="empty" title="Empty story"><Variant id="normal"><span>No tests</span></Variant></Story></template>')
    project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
    await dev.ready
    const services = getProjectServices(project)
    const runtime = services.dev!.controller.current!
    const result = await services.execution.enqueue(createHistoireTestCollectionTask(runtime.context, {})).result
    expect(result.execution).toMatchObject({ mode: 'server', epoch: runtime.epoch })
    const tested = result.variants.find(entry => entry.target.variantId === 'tested')!
    expect(tested.collection.definitions.map(test => test.mode ?? 'run')).toEqual(['run', 'skip', 'todo'])
    expect(result.variants.find(entry => entry.target.variantId === 'empty')?.collection).toEqual({ definitions: [] })
    expect(result.variants.find(entry => entry.target.storyId === 'empty')?.collection).toEqual({ definitions: [] })
    expect(result.variants.find(entry => entry.target.variantId === 'broken')?.collection.error).toMatchObject({ message: 'Registration failed' })
    expect(effects).toEqual([])
    const pane = await createTestDiscoveryPane(fixture.root, createEmbedDescriptor(runtime.context, services.dev!.catalog!.current!, 'dev', undefined, 'local'), result)
    let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
    try {
      browser = await launchEmbedBrowser()
      const page = await browser.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(pane.url)
      await page.getByRole('button', { name: 'All', exact: true }).click()
      await page.locator('.test-row').filter({ hasText: 'Tested' }).waitFor()
      expect(await page.locator('.test-row').count()).toBe(4)
      expect(await page.locator('.test-row').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('Skipped only'), expect.stringContaining('Todo only')]))
      expect(await page.getByText('Empty sibling', { exact: true }).count()).toBe(0)
      expect(await page.getByText('Empty story', { exact: true }).count()).toBe(0)
      expect(await page.evaluate('window.paneFacts()')).toEqual({ discoveries: 1, selection: null, results: [null, null, null, null, null, null] })
      expect(errors).toEqual([])
      expect(effects).toEqual([])
      await page.evaluate('window.closePane()')
    }
    finally {
      await browser?.close()
      await pane.close()
    }
    // Discovery cleanup releases the same lane for subsequent assertion execution.
    const run = await project.runTests({ storyId: 'test-book', variantId: 'tested' })
    expect(run).toMatchObject({ passed: 1, skipped: 2, failed: 0 })
    expect(effects).toContain('/body')
    expect(effects).toContain('/beforeEach')
  }
  finally {
    await project?.close()
    await closeOwnedServer(marker)
    await fixture.close()
  }
}, 120_000)
