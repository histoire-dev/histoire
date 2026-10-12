import type { ServerResponse } from 'node:http'
import { writeFile } from 'node:fs/promises'
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

it('preserves partial definitions through cancellation, reload, browser timeout and lost transport reply', async () => {
  const fixture = await createMcpBrowserTestProject()
  const pending = new Set<ServerResponse>()
  let hold = false
  let requests = 0
  let peak = 0
  const marker = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    if (hold && request.url === '/setup') {
      requests++
      pending.add(response)
      peak = Math.max(peak, pending.size)
      response.once('close', () => pending.delete(response))
    }
    else {
      response.end('ready')
    }
  })
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  try {
    const origin = await listenOwnedServer(marker, 0, '127.0.0.1')
    await writeFile(resolve(fixture.root, 'Book.story.vue'), `<script setup>
import {onTest} from 'histoire/client';import {it,expect} from 'vitest';
onTest(({canvas})=>it('healthy',()=>expect(canvas.querySelector('button')).not.toBeNull()))
</script><template><Story id="healthy" title="Healthy"><Variant id="main"><button>Healthy</button></Variant></Story></template>`)
    await writeFile(resolve(fixture.root, 'Slow.story.vue'), `<script setup>
import {onTest} from 'histoire/client';import {it} from 'vitest';
onTest(()=>it('slow definition',()=>{}))
async function setup(){await fetch('${origin}/setup')}
</script><template><Story id="slow"><Variant id="main" :setup-app="setup"><span>Slow</span></Variant></Story></template>`)
    await writeFile(resolve(fixture.root, 'custom config.ts'), `import {HstVue} from '@histoire/plugin-vue';export default {plugins:[HstVue()],storyMatch:['*.story.vue'],mcp:false,test:{collectTimeout:8000,runTimeout:60000}}`)
    project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
    await dev.ready
    const services = getProjectServices(project)
    const context = () => services.dev!.controller.current!.context
    hold = true
    const started = performance.now()
    const completed = new Map<string, number>()
    const task = services.execution.enqueue(createHistoireTestCollectionTask(context(), { onProgress(result) {
      for (const entry of result.variants) completed.set(entry.target.storyId, entry.collection.definitions.length)
    } }))
    let settled = false
    void task.result.finally(() => {
      settled = true
    }).catch(() => {})
    await vi.waitFor(() => expect(completed.get('healthy')).toBe(1), { timeout: 5000 })
    expect(performance.now() - started).toBeLessThan(5000)
    expect(completed.get('empty')).toBe(0)
    // Healthy and Slow specs collect concurrently: healthy progress can publish
    // before Slow's held setup request reaches the marker server.
    await vi.waitFor(() => expect(pending.size).toBe(1), { timeout: 5000 })
    expect(completed.has('slow')).toBe(false)
    expect(settled).toBe(false)
    const queued = services.execution.enqueue(createHistoireTestCollectionTask(context(), {}))
    expect(queued.state).toBe('queued')
    for (const response of pending) response.end('released')
    const result = await task.result
    expect(result.variants.map(entry => entry.target.storyId).sort()).toEqual(['empty', 'healthy', 'slow'])
    expect(completed.get('slow')).toBe(1)
    const reused = await queued.result
    expect(reused.variants).toEqual(result.variants)
    expect(reused.execution.runId).not.toBe(result.execution.runId)
    expect(requests).toBe(1)
    const cancellation = services.execution.enqueue(createHistoireTestCollectionTask(context(), { force: true }))
    const rejected = expect(cancellation.result).rejects.toMatchObject({ code: 'CANCELLED' })
    await vi.waitFor(() => expect(pending.size).toBe(1), { timeout: 10_000 })
    cancellation.cancel()
    await rejected
    await vi.waitFor(() => expect(pending.size).toBe(0))
    const run = await project.runTests({ storyId: 'healthy', variantId: 'main' })
    expect(run).toMatchObject({ passed: 1, failed: 0, total: 1 })
    const browser = await launchEmbedBrowser()
    try {
      const page = await browser.newPage()
      await page.addInitScript(`localStorage.setItem('_histoire-ui-shell',JSON.stringify({pane:'tests',panelOpen:true}))`)
      let dropReply = false
      let lostReply: string | undefined
      let lostId: string | undefined
      let lateReply: ((value: string) => void) | undefined
      const cancellations: string[] = []
      // Suppress only terminal frames at the actual WebSocket boundary. Owned
      // transport, deadlines, server cleanup and workbench model remain real.
      await page.routeWebSocket('**/*', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((value) => {
          const message = JSON.parse(String(value))
          if (message.event === 'histoire:dev-event' && message.data?.event === 'cancelStoryTests') cancellations.push(message.data.payload.requestId)
          server.send(value)
        })
        server.onMessage((value) => {
          const message = JSON.parse(String(value))
          if (dropReply && message.event === 'histoire:dev-event-result' && message.data?.event === 'collectStoryTests') {
            lostReply = String(value)
            lostId = message.data.requestId
            lateReply = value => socket.send(value)
          }
          else {
            socket.send(value)
          }
        })
      })
      hold = false
      await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
      // Initial publication may reuse successful server collection. Force real
      // discovery to retain this scenario's held-setup/progress contract.
      await vi.waitFor(async () => expect(await page.getByRole('button', { name: 'Refresh tests', exact: true }).isEnabled()).toBe(true), { timeout: 5000 })
      hold = true
      const started = performance.now()
      await page.getByRole('button', { name: 'Refresh tests', exact: true }).click()
      await page.waitForFunction(`document.querySelector('.collection-progress')?.textContent.includes('2/3')`, undefined, { timeout: 5000 })
      expect(performance.now() - started).toBeLessThan(5000)
      // Same concurrent-spec ordering as above: 2/3 may precede the held request.
      await vi.waitFor(() => expect(pending.size).toBe(1), { timeout: 5000 })
      await page.getByRole('button', { name: 'All', exact: true }).click()
      const healthy = page.getByRole('button', { name: /^Healthy \// })
      await healthy.waitFor({ timeout: 1000 })
      expect(await healthy.isEnabled()).toBe(true)
      expect(await page.locator('.collection-progress').textContent()).toContain('Collecting tests…')
      const previous = requests
      const retired = [...pending]
      await page.reload({ waitUntil: 'domcontentloaded' })
      await vi.waitFor(() => expect(requests).toBe(previous + 1), { timeout: 10_000 })
      expect(retired.every(response => response.destroyed)).toBe(true)
      expect(peak).toBe(1)
      await page.getByRole('button', { name: 'All', exact: true }).click()
      await healthy.waitFor()
      for (const response of pending) response.end('released')
      await page.waitForFunction(`!document.querySelector('.collection-progress')`, undefined, { timeout: 5000 })
      expect(await page.locator('.test-row').count()).toBe(2)
      expect(await page.getByRole('alert').count()).toBe(0)
      // A stalled mounted setup consumes the same deadline as worker startup.
      await page.getByRole('button', { name: 'Refresh tests', exact: true }).click()
      await page.waitForFunction(`(${TEST_DISCOVERY_FACTS})()?.status==='error'`, undefined, { timeout: 15_000 })
      expect(await page.evaluate(`(${TEST_DISCOVERY_FACTS})().error.code`)).toBe('TIMEOUT')
      expect(await page.locator('.test-row').count()).toBe(2)
      expect(await page.getByRole('button', { name: 'Refresh tests', exact: true }).isEnabled()).toBe(true)
      await vi.waitFor(() => expect(pending.size).toBe(0))
      hold = false
      await page.getByRole('button', { name: 'Retry collection', exact: true }).click()
      await page.waitForFunction(`(${TEST_DISCOVERY_FACTS})()?.status==='completed'`)
      expect(await project.runTests({ storyId: 'healthy', variantId: 'main' })).toMatchObject({ passed: 1, failed: 0 })
      dropReply = true
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: 'All', exact: true }).click()
      await vi.waitFor(() => expect(lostId).toBeTypeOf('string'), { timeout: 5000 })
      await page.waitForFunction(`(${TEST_DISCOVERY_FACTS})()?.status==='error'`, undefined, { timeout: 32_000 })
      expect(await page.evaluate(`(${TEST_DISCOVERY_FACTS})().error.code`)).toBe('TIMEOUT')
      expect(cancellations).toContain(lostId)
      expect(await page.locator('.test-row').count()).toBe(2)
      expect(await page.getByRole('button', { name: 'Refresh tests', exact: true }).isEnabled()).toBe(true)
      lateReply!(lostReply!)
      expect(await page.evaluate(`(${TEST_DISCOVERY_FACTS})().status`)).toBe('error')
      dropReply = false
      await page.getByRole('button', { name: 'Retry collection', exact: true }).click()
      await page.waitForFunction(`(${TEST_DISCOVERY_FACTS})()?.status==='completed'`)
      expect(await page.getByRole('alert').count()).toBe(0)
    }
    finally { await browser.close() }
  }
  finally {
    for (const response of pending) response.end('closed')
    await project?.close()
    await closeOwnedServer(marker)
    await fixture.close()
  }
}, 120_000)
