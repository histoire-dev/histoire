import type { ServerResponse } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { expect, it, vi } from 'vitest'
import { getProjectServices } from '../../../../../dist/node/api/internal.js'
import { createHistoireTestCollectionTask } from '../../../../../dist/node/test/execution-service.js'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { createMcpBrowserTestProject } from '../../utils/mcp/browser-test-project.js'

it('bounds held eligibility transforms, retires late completion, and releases lane for fresh work', async () => {
  // Supported user Vite plugin waits on an actual HTTP service. A missing
  // eligibility deadline leaves task pending; stale cache would skip recovery.
  const fixture = await createMcpBrowserTestProject()
  const pending = new Set<ServerResponse>()
  let hold = false
  const marker = createServer((_request, response) => {
    if (hold) {
      pending.add(response)
      response.once('close', () => pending.delete(response))
    }
    else {
      response.end('released')
    }
  })
  let project: Awaited<ReturnType<typeof createHistoireProject>> | undefined
  try {
    const origin = await listenOwnedServer(marker, 0, '127.0.0.1')
    await writeFile(resolve(fixture.root, 'held.ts'), 'export const held=true')
    await writeFile(resolve(fixture.root, 'Book.story.vue'), '<script setup>import {held} from "./held"</script><template><Story id="held"><Variant id="main">{{held}}</Variant></Story></template>')
    await writeFile(resolve(fixture.root, 'custom config.ts'), `
import {HstVue} from '@histoire/plugin-vue';
export default {plugins:[HstVue()],storyMatch:['*.story.vue'],mcp:false,test:{collectTimeout:500},
vite:{plugins:[{name:'held-eligibility',async transform(code,id){if(!this.meta.histoire?.isCollecting&&id.endsWith('/held.ts'))await fetch('${origin}');return code}}]}}
`)
    project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    const dev = await project.startDev({ host: '127.0.0.1', port: 0 })
    await dev.ready
    const services = getProjectServices(project)
    const context = () => services.dev!.controller.current!.context
    hold = true
    await writeFile(resolve(fixture.root, 'held.ts'), 'export const held=true // retire served transform')
    await vi.waitFor(() => expect(services.dev!.catalog!.updating).toBe(false))
    const published: unknown[] = []
    const started = performance.now()
    const timed = services.execution.enqueue(createHistoireTestCollectionTask(context(), { onProgress: value => published.push(value) }))
    let failure: unknown
    void timed.result.catch((error) => {
      failure = error
    })
    await vi.waitFor(() => expect(pending.size).toBeGreaterThan(0))
    await vi.waitFor(() => expect(failure, 'Eligibility timeout did not settle').toMatchObject({ code: 'TIMEOUT' }), { timeout: 3000 })
    expect(performance.now() - started).toBeLessThan(3000)
    expect(published).toEqual([])
    for (const response of pending) response.end('late completion')
    await vi.waitFor(() => expect(pending.size).toBe(0))
    const cancelled = services.execution.enqueue(createHistoireTestCollectionTask(context(), { onProgress: value => published.push(value) }))
    const cancellation = expect(cancelled.result).rejects.toMatchObject({ code: 'CANCELLED' })
    await vi.waitFor(() => expect(pending.size).toBeGreaterThan(0))
    expect(cancelled.state).toBe('running')
    cancelled.cancel()
    await cancellation
    hold = false
    for (const response of pending) response.end('released')
    // Late successful transform cannot revive the expired operation.
    const recovered = await services.execution.enqueue(createHistoireTestCollectionTask(context(), {})).result
    expect(recovered.variants.map(entry => entry.target.storyId).sort()).toEqual(['empty', 'held'])
    expect(recovered.variants.every(entry => !entry.collection.error && !entry.collection.definitions.length)).toBe(true)
    expect(published).toEqual([])
  }
  finally {
    hold = false
    for (const response of pending) response.end('closed')
    await project?.close()
    await closeOwnedServer(marker)
    await fixture.close()
  }
}, 30_000)
