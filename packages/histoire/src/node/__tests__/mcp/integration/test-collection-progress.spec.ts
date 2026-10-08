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

it('publishes healthy mounted targets before slow setup and cancels without losing execution lane', async () => {
  const fixture = await createMcpBrowserTestProject()
  const pending = new Set<ServerResponse>()
  let hold = false
  const marker = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    if (hold && request.url === '/setup') {
      pending.add(response)
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
    expect(completed.has('slow')).toBe(false)
    expect(pending.size).toBe(1)
    expect(settled).toBe(false)
    for (const response of pending) response.end('released')
    const result = await task.result
    expect(result.variants.map(entry => entry.target.storyId).sort()).toEqual(['empty', 'healthy', 'slow'])
    expect(completed.get('slow')).toBe(1)
    const cancellation = services.execution.enqueue(createHistoireTestCollectionTask(context(), {}))
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
      const started = performance.now()
      await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(`document.querySelector('.collection-progress')?.textContent.includes('2/3')`, undefined, { timeout: 5000 })
      expect(performance.now() - started).toBeLessThan(5000)
      expect(pending.size).toBe(1)
      await page.getByRole('button', { name: 'All', exact: true }).click()
      const healthy = page.getByRole('button', { name: /^Healthy \// })
      await healthy.waitFor({ timeout: 1000 })
      expect(await healthy.isEnabled()).toBe(true)
      expect(await page.locator('.collection-progress').textContent()).toContain('Collecting tests…')
      for (const response of pending) response.end('released')
      await page.waitForFunction(`!document.querySelector('.collection-progress')`, undefined, { timeout: 5000 })
      expect(await page.locator('.test-row').count()).toBe(2)
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
}, 60_000)
