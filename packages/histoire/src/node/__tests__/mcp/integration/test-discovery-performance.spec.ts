import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { expect, it } from 'vitest'
import { getProjectServices } from '../../../../../dist/node/api/internal.js'
import { createHistoireTestCollectionTask } from '../../../../../dist/node/test/execution-service.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { TEST_DISCOVERY_FACTS as publishedFacts } from '../../utils/mcp/test-discovery-observer.js'
import { createVue3DiscoveryProject } from '../../utils/mcp/vue3-discovery-project.js'

it('publishes complete real Vue3 inventory within 5s on three cold source pages, refresh and HMR', async () => {
  for (let sample = 1; sample <= 3; sample++) {
    const fixture = await createVue3DiscoveryProject()
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    let browser: Awaited<ReturnType<typeof launchEmbedBrowser>> | undefined
    try {
      project = await createHistoireProject({ root: fixture.root })
      const dev = await project.startDev({ host: '127.0.0.1', port: 0, open: false })
      await dev.ready
      const services = getProjectServices(project)
      const stories = services.dev!.controller.current!.context.storyFiles.filter(file => file.story && !file.story.docsOnly)
      const targets = services.dev!.catalog!.current!.catalog.stories.filter(story => !story.docsOnly).flatMap(story => story.variants.map(variant => ({ storyId: story.id, variantId: variant.id })))
      expect(stories).toHaveLength(41)
      expect(targets).toHaveLength(1095)
      expect(stories.find(file => file.story!.title === 'HugeGrid')!.story!.variants).toHaveLength(1000)
      browser = await launchEmbedBrowser()
      const page = await browser.newPage()
      await page.addInitScript(`localStorage.setItem('_histoire-ui-shell',JSON.stringify({pane:'tests',panelOpen:true}))`)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      let requested = 0
      let terminal: any
      page.on('websocket', (socket) => {
        socket.on('framesent', (frame) => {
          const message = JSON.parse(String(frame.payload))
          if (message.event === 'histoire:dev-event' && message.data?.event === 'collectStoryTests') requested = performance.now()
        })
        socket.on('framereceived', (frame) => {
          const message = JSON.parse(String(frame.payload))
          if (message.event === 'histoire:dev-event-result' && message.data?.event === 'collectStoryTests') terminal = { ...message.data, duration: performance.now() - requested }
        })
      })
      /** Both transport inventory and immutable UI evidence must agree before timing can pass. */
      async function verify(started: number, inventory = targets, definitions = 11, phase = 'cold') {
        try {
          // HMR admission may be rejected during catalog publication. Measure
          // actual replacement completion, including any automatic retry.
          const states = phase === 'HMR' ? ['completed'] : ['completed', 'error']
          await page.waitForFunction(`${JSON.stringify(states)}.includes((${publishedFacts})()?.status)`, undefined, { timeout: 10_000, polling: 20 })
        }
        catch (error) {
          console.error('Discovery incomplete', { sample, terminal: terminal && { error: terminal.error, code: terminal.code, targets: terminal.result?.variants.length }, errors, pane: await page.locator('.tests-panel').textContent().catch(() => null) })
          throw error
        }
        const duration = performance.now() - started
        const facts = await page.evaluate(`(${publishedFacts})()`)
        expect(facts.status, JSON.stringify({ error: facts.error, terminal: terminal?.error, errors })).toBe('completed')
        expect(terminal.error).toBeUndefined()
        expect(terminal.result.variants.map((entry: any) => entry.target)).toEqual(inventory)
        expect(facts.progress).toEqual({ completed: inventory.length, total: inventory.length })
        const admitted = new Set(inventory.map(target => JSON.stringify(target)))
        const published = facts.variants.filter((entry: any) => admitted.has(JSON.stringify(entry.target)))
        expect(published.map((entry: any) => entry.target)).toEqual(inventory)
        expect(published.every((entry: any) => entry.collection && !entry.collection.error && !entry.summary)).toBe(true)
        expect(published.reduce((total: number, entry: any) => total + entry.collection.definitions.length, 0)).toBe(definitions)
        expect(errors).toEqual([])
        process.stderr.write(`${JSON.stringify({ sample, phase, navigationToPublication: duration, collectionRequest: terminal.duration, targets: inventory.length })}\n`)
        // Full example reload includes opaque Lottie code, which must remain
        // mounted. Measure a complete cache hit separately below.
        expect(terminal.duration).toBeLessThan(phase === 'refresh' ? 2000 : 5000)
        expect(duration).toBeLessThan(phase === 'refresh' ? 2000 : 5000)
      }
      const started = performance.now()
      await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
      await verify(started)
      if (sample === 3) {
        const mocking = stories.find(file => file.story!.title === 'Vitest Mocking')!
        const cachedStarted = performance.now()
        const cached = await services.execution.enqueue(createHistoireTestCollectionTask(services.dev!.controller.current!.context, { storyId: mocking.story!.id })).result
        expect(cached.execution.runId).not.toBe(terminal.result.execution.runId)
        expect(cached.variants.map(entry => entry.target)).toEqual(targets.filter(target => target.storyId === mocking.story!.id))
        expect(cached.variants.every(entry => !entry.collection.error)).toBe(true)
        expect(cached.variants.flatMap(entry => entry.collection.definitions)).toHaveLength(6)
        process.stderr.write(`${JSON.stringify({ sample, phase: 'cache hit', collectionRequest: performance.now() - cachedStarted })}\n`)
        expect(performance.now() - cachedStarted).toBeLessThan(1000)
        terminal = undefined
        const refresh = performance.now()
        await page.reload({ waitUntil: 'domcontentloaded' })
        await verify(refresh, targets, 11, 'refresh')
        terminal = undefined
        const changed = performance.now()
        const lifecycle = stories.find(file => file.story!.title === 'Vitest Lifecycle')!
        await appendFile(resolve(fixture.root, lifecycle.relativePath), '\n<!-- Discovery HMR gate -->\n')
        await page.waitForFunction(`(${publishedFacts})()?.status !== 'completed'`, undefined, { timeout: 10_000 })
        await verify(changed, targets.filter(target => target.storyId === lifecycle.story!.id), 5, 'HMR')
        // Definition collection must leave native Vitest mocks intact for subsequent assertions.
        const mocked = stories.find(file => file.story!.title === 'Vitest Mocking')!
        expect(await project.runTests({ storyId: mocked.story!.id })).toMatchObject({ total: 6, passed: 4, skipped: 2, failed: 0 })
      }
    }
    finally {
      await browser?.close()
      await project?.close()
      await fixture.close()
    }
  }
}, 120_000)
