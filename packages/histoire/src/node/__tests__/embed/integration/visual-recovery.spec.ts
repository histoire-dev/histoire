import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { getProjectServices } from '../../../../../dist/node/api/internal.js'
import { createVisualService } from '../../../../../dist/node/visual/service.js'
import { resolveVisualSource } from '../../../../../dist/node/visual/source.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'
import { createEmbedVueProject } from '../../utils/embed/vue-project.js'
import { openVisualTestsPane } from '../../utils/embed/workbench.js'
import { startMcpProcess } from '../../utils/mcp/process.js'

/** Reuse real project-owned runtime and lane; recovery never replaces capture logic. */
function reviewService(project: Awaited<ReturnType<typeof createHistoireProject>>) {
  return createVisualService(() => {
    const services = getProjectServices(project)
    const source = services.dev!.controller.current!
    return resolveVisualSource(source.context, source.server, services.dev!.execution, source.isActive, source.epoch)
  })
}

/** Deterministic SVG stories share fixture dependency links and isolated optimizer outputs. */
async function recoveryProject() {
  const fixture = await createEmbedVueProject('Recovery')
  await writeFile(join(fixture.root, 'Shape.vue'), '<template><svg width="40" height="40"><rect width="40" height="40" fill="#123456"/></svg></template>')
  await writeFile(join(fixture.root, 'One.story.vue'), `<script setup>import Shape from './Shape.vue'</script><template><Story id="one" title="One"><Variant id="main"><Shape/></Variant></Story></template>`)
  await writeFile(join(fixture.root, 'Two.story.vue'), '<template><Story id="two" title="Two"><Variant id="main"><svg width="40" height="40"><rect width="40" height="40" fill="#abcdef"/></svg></Variant></Story></template>')
  await writeFile(join(fixture.root, 'custom.ts'), 'import {HstVue} from \'@histoire/plugin-vue\';export default {plugins:[HstVue()],storyMatch:[\'*.story.vue\'],collectMaxThreads:1,mcp:false,routerMode:\'hash\',visual:{profiles:[{id:\'small\',width:80,height:80}]}}')
  return fixture
}

describe('durable visual recovery consumer', () => {
  it('restores interrupted captures, approves retained bytes, merges targeted runs and invalidates only changed story', async () => {
    const fixture = await recoveryProject()
    const projects: Awaited<ReturnType<typeof createHistoireProject>>[] = []
    const services: ReturnType<typeof createVisualService>[] = []
    /** Restart same real source with different ephemeral port and runtime generation. */
    async function start() {
      const project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
      projects.push(project)
      const server = await project.startDev({ host: '127.0.0.1', port: 0, mcp: false, agents: false })
      await server.ready
      const service = reviewService(project)
      services.push(service)
      return { project, service }
    }
    try {
      const first = await start()
      const abort = new AbortController()
      const partial = await first.service.run({ signal: abort.signal }, (run) => {
        if (run.results.length === 1) abort.abort()
      })
      expect(partial.state).toBe('cancelled')
      expect(partial.results.filter(result => result.status === 'missing'), JSON.stringify(partial.results)).toHaveLength(1)
      const captured = partial.results[0]
      const image = await readFile(join(fixture.root, `.histoire/visual/runs/${partial.id}/images/${captured.images.current}`))
      await first.service.close()
      await first.project.close()
      const second = await start()
      const session = second.service.createReviewSession()
      const restored = await session.recover()
      expect(restored.issues).toEqual([])
      expect(restored.results).toHaveLength(1)
      expect(restored.results[0]).toMatchObject({ id: captured.id, currentHash: captured.currentHash, restored: true })
      expect(restored.results[0].staleReason).toBeUndefined()
      expect(await readdir(join(fixture.root, '.histoire/visual/runs'))).toEqual([partial.id])
      expect(await session.approve([{ handle: restored.results[0].reviewHandle!, resultId: captured.id }])).toEqual([{ resultId: captured.id, status: 'approved' }])
      expect(await readFile(join(fixture.root, `.histoire/visual/runs/${partial.id}/images/${captured.images.current}`))).toEqual(image)
      const repeated = await second.project.visual.run({ caseId: captured.case.id })
      expect(repeated.results[0].status).toBe('passed')
      await second.project.visual.run({ storyId: 'two' })
      const before = await session.recover()
      expect(before.results.map(result => result.case.storyId).sort()).toEqual(['one', 'two'])
      await second.service.close()
      await second.project.close()
      await writeFile(join(fixture.root, 'Shape.vue'), '<template><svg width="40" height="40"><rect width="40" height="40" fill="#654321"/></svg></template>')
      const third = await start()
      const recovered = await third.service.createReviewSession().recover()
      expect(recovered.results.find(result => result.case.storyId === 'one')?.staleReason).toContain('Source')
      expect(recovered.results.find(result => result.case.storyId === 'two')?.staleReason).toBeUndefined()
    }
    finally {
      for (const service of services) await service.close()
      for (const project of projects) await project.close()
      await fixture.close()
    }
  })

  it('restores workbench review after actual server restart and reruns only selected comparison', async () => {
    const fixture = await recoveryProject()
    const browser = await launchEmbedBrowser()
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const approvals: { requestId: string, done?: boolean, receipts?: { status: string }[] }[] = []
    page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload))
      if (message.event === 'histoire:ui:visual-result' && (message.data.receipts || message.data.done)) approvals.push(message.data)
    }))
    const projects: Awaited<ReturnType<typeof createHistoireProject>>[] = []
    /** Fresh ephemeral server shares durable cache, never live runtime generation. */
    async function open() {
      const project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
      projects.push(project)
      const server = await project.startDev({ host: '127.0.0.1', port: 0, mcp: false, agents: false })
      await server.ready
      await page.goto(`${server.url}#/story/one?variantId=main`)
      await page.locator('iframe[title="Histoire variant"]').first().contentFrame().locator('[data-test-id="sandbox-render"] svg').waitFor()
      await openVisualTestsPane(page)
      return project
    }
    try {
      const first = await open()
      const panel = page.getByRole('region', { name: 'Visual tests' })
      await panel.getByRole('button', { name: /^\s*Run\s*$/ }).click()
      await expect.poll(() => panel.getByRole('button', { name: /^Review / }).count(), { timeout: 60_000 }).toBe(2)
      const runsBefore = await readdir(join(fixture.root, '.histoire/visual/runs'))
      // Drop actual Vite sockets; reconnect must restore without new comparisons.
      const viteClient = new URL('/book/@vite/client', page.url()).href
      await page.evaluate(`(async () => {
        const { createHotContext } = await import(${JSON.stringify(viteClient)})
        window.visualDisconnectState = new Promise(resolve => {
          createHotContext('/visual-recovery-reconnect').on('vite:ws:disconnect', () => {
            queueMicrotask(() => resolve(document.querySelector('[aria-label="Visual tests"] [role="alert"]')?.textContent ?? ''))
          })
        })
      })()`)
      const disconnected = page.evaluate(() => (window as any).visualDisconnectState)
      const connection = page.waitForEvent('websocket', { timeout: 30_000 })
      const devSource = getProjectServices(first).dev!.controller.current!
      for (const client of devSource.server.ws.clients) client.socket.close()
      expect(await disconnected).toBe('')
      await connection
      // Vite reloads document after restoring its socket: wait for replacement document before reading restored pane.
      await expect.poll(() => page.evaluate(() => 'visualDisconnectState' in window).catch(() => true), { timeout: 30_000 }).toBe(false)
      await openVisualTestsPane(page)
      await expect.poll(() => panel.getByRole('button', { name: /^\s*Run\s*$/ }).isEnabled(), { timeout: 30_000 }).toBe(true)
      expect(await panel.getByRole('alert').allTextContents()).toEqual([])
      expect(await panel.getByRole('button', { name: /^Review / }).count()).toBe(2)
      expect(await readdir(join(fixture.root, '.histoire/visual/runs'))).toEqual(runsBefore)
      await first.close()
      const second = await open()
      await expect.poll(() => panel.getByRole('button', { name: /^Review / }).count(), { timeout: 30_000 }).toBe(2)
      expect(await readdir(join(fixture.root, '.histoire/visual/runs'))).toEqual(runsBefore)
      await panel.getByRole('button', { name: /^Review One / }).click()
      const dialog = page.getByRole('dialog', { name: /One/ })
      await dialog.getByRole('img', { name: /^current/i }).waitFor()
      const src = await dialog.getByRole('img', { name: /^current/i }).getAttribute('src')
      expect((await page.request.get(new URL(src!, page.url()).href)).status()).toBe(200)
      await dialog.getByRole('button', { name: 'Create baseline', exact: true }).click()
      await expect.poll(() => dialog.getByText('Approved', { exact: true }).count()).toBe(1)
      expect(approvals.find(reply => reply.receipts)?.done).toBe(false)
      await expect.poll(() => approvals.some(reply => reply.done === true && reply.requestId === approvals.find(value => value.receipts)?.requestId)).toBe(true)
      await page.keyboard.press('Escape')
      await expect.poll(() => dialog.count()).toBe(0)
      expect(await panel.getByRole('button', { name: /^\s*Run\s*$/ }).evaluate(element => element === document.activeElement)).toBe(true)
      await panel.getByRole('checkbox', { name: /^Select Two / }).check()
      await panel.getByRole('button', { name: 'Approve 1 selected', exact: true }).click()
      await panel.getByText('No visual changes', { exact: true }).waitFor()
      await panel.getByRole('button', { name: 'Show all results', exact: true }).click()
      await panel.getByRole('button', { name: /^Run again One / }).click()
      expect(await panel.getByRole('button', { name: /^Review Two / }).count()).toBe(1)
      await expect.poll(() => panel.getByRole('button', { name: /^\s*Run\s*$/ }).count(), { timeout: 60_000 }).toBe(1)
      await expect.poll(() => panel.getByRole('button', { name: /, Passed$/ }).count()).toBe(1)
      expect(await panel.getByRole('button', { name: /^Review / }).count()).toBe(2)
      expect((await readdir(join(fixture.root, '.histoire/visual/runs'))).length).toBe(runsBefore.length + 1)
      expect((await second.visual.run()).results.every(result => result.status === 'passed')).toBe(true)
      // Every comparison now has valid evidence; incremental run captures nothing.
      const incremental = await second.visual.run({ incremental: true })
      expect({ total: incremental.total, reused: incremental.reused, ok: incremental.ok }).toEqual({ total: 0, reused: { total: 2, failing: 0 }, ok: true })
    }
    finally {
      await page.close()
      await browser.close()
      for (const project of projects) await project.close()
      await fixture.close()
    }
  })

  it('restores finished comparison after CLI is killed before report publication', async () => {
    const fixture = await recoveryProject()
    let command: ReturnType<typeof startMcpProcess> | undefined
    let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
    let service: ReturnType<typeof createVisualService> | undefined
    try {
      await writeFile(join(fixture.root, 'Two.story.vue'), `<script setup>import {ref} from 'vue';const value=ref('');if(typeof window!=='undefined')setInterval(()=>value.value=String(Date.now()),3)</script><template><Story id="two" title="Two"><Variant id="main"><div>{{value}}</div></Variant></Story></template>`)
      command = startMcpProcess(['visual', '--config', 'custom.ts'], fixture.root)
      const latest = join(fixture.root, '.histoire/visual/latest')
      await expect.poll(async () => (await readdir(latest).catch(() => [])).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).length, { timeout: 60_000 }).toBe(1)
      const pointer = JSON.parse(await readFile(join(latest, (await readdir(latest))[0]), 'utf8'))
      command.child.kill('SIGKILL')
      expect((await command.completion).signal).toBe('SIGKILL')
      await expect(readFile(join(fixture.root, `.histoire/visual/runs/${pointer.runId}/report.json`))).rejects.toMatchObject({ code: 'ENOENT' })
      project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
      const server = await project.startDev({ host: '127.0.0.1', port: 0, mcp: false, agents: false })
      await server.ready
      service = reviewService(project)
      const recovered = await service.createReviewSession().recover()
      expect(recovered.issues).toEqual([])
      expect(recovered.results).toHaveLength(1)
      expect(recovered.results[0]).toMatchObject({ artifactRunId: pointer.runId, status: 'missing', case: { storyId: 'one' } })
      // CLI forces development; Vitest's Node API consumer otherwise uses test.
      expect(recovered.results[0].staleReason).toBe(process.env.NODE_ENV === 'development' ? undefined : 'Source environment changed since capture')
      expect(await readdir(join(fixture.root, '.histoire/visual/runs'))).toEqual([pointer.runId])
    }
    finally {
      await command?.close()
      await service?.close()
      await project?.close()
      await fixture.close()
    }
  })
})
