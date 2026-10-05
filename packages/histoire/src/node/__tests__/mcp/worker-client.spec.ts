import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createHistoireMcpServer } from '../../mcp/server/factory.js'
import { createMcpWorkerClient } from '../../mcp/transport/worker-client.js'
import { createWorkerProject } from '../../mcp/transport/worker-project.js'
import { createMcpTestClient } from '../utils/mcp/client.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createReadProjectFixture } from '../utils/mcp/read-project.js'

const close: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.allSettled(close.splice(0).reverse().map(dispose => dispose()))
})

/** Real owned child fixture; responses deliberately reverse and inject an unknown ID. */
async function fixture(body: string) {
  const project = await createReadProjectFixture()
  close.push(project.close)
  const root = project.context.root
  const entry = `${root}/owned worker.mjs`
  await writeFile(entry, `
const project = ${JSON.stringify(await project.project.getProject())};
process.send({ type: 'boot', project, executors: { screenshot: false, tests: false } });
process.on('message', message => {
  if (message.type === 'shutdown') { process.disconnect(); return; }
  ${body}
});
process.once('disconnect', () => {});
`)
  const worker = createMcpWorkerClient({ root, entry: pathToFileURL(entry), projectId: project.project.projectId, principal: 'stdio:550e8400-e29b-41d4-a716-446655440000' })
  close.push(worker.close)
  await worker.ready
  return worker
}

describe('owned worker requests', () => {
  it('settles exact concurrent IDs in reverse order and ignores unknown responses', async () => {
    const worker = await fixture(`
if (message.type !== 'request') return;
globalThis.first ??= message;
if (globalThis.first.id === message.id) return;
process.send({ type: 'result', id: '550e8400-e29b-41d4-a716-446655440000:9', data: project });
process.send({ type: 'result', id: message.id, data: { ...project, title: 'second' } });
process.send({ type: 'result', id: globalThis.first.id, data: { ...project, title: 'first' } });
`)
    const results = await Promise.all([worker.request('getProject', {}), worker.request('getProject', {})])
    expect(results.map(result => result.title)).toEqual(['first', 'second'])
    const pid = worker.pid
    await worker.close()
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('rejects all pending requests on exact child crash without awaiting request deadlines', async () => {
    const worker = await fixture(`if (message.type === 'request') process.exit(7);`)
    const results = await Promise.allSettled([worker.request('getProject', {}), worker.request('getProject', {})])
    expect(results).toHaveLength(2)
    expect(results.every(result => result.status === 'rejected' && /Histoire MCP worker (?:exited|disconnected)/.test(result.reason.message))).toBe(true)
    expect(results[0].status === 'rejected' && results[1].status === 'rejected' && results[0].reason === results[1].reason).toBe(true)
    await worker.exited
  })

  it('does not reuse cancelled request ownership and continues serving later requests', async () => {
    const worker = await fixture(`
if (message.type !== 'request') return;
globalThis.counter = (globalThis.counter ?? 0) + 1;
if (globalThis.counter > 1) process.send({ type: 'result', id: message.id, data: project });
`)
    const abort = new AbortController()
    const pending = worker.request('getProject', {}, abort.signal)
    abort.abort(new Error('Caller cancelled'))
    await expect(pending).rejects.toThrow('Caller cancelled')
    expect((await worker.request('getProject', {})).status).toBe('ready')
  })

  it('does not report confirmed successful cleanup when worker exits with failure', async () => {
    const worker = await fixture(`
if (message.type === 'request') {
  process.exitCode = 1;
  process.send({ type: 'result', id: message.id, data: project });
}
`)
    await worker.request('getProject', {})
    await expect(worker.close()).rejects.toThrow('Histoire MCP worker cleanup failed')
    expect(() => process.kill(worker.pid, 0)).toThrow()
  })

  it('propagates official SDK request cancellation into finite worker IPC', async () => {
    const worker = await fixture(`
if (message.type !== 'request') return;
globalThis.counter = (globalThis.counter ?? 0) + 1;
if (globalThis.counter > 1) process.send({ type: 'result', id: message.id, data: project });
`)
    const observed = deferred<AbortSignal>()
    const request = worker.request
    worker.request = (method, input, signal) => {
      observed.resolve(signal)
      return request(method, input, signal)
    }
    const projectId = (await worker.ready).project.projectId
    const serving = await createMcpTestClient(() => createHistoireMcpServer({ project: createWorkerProject(worker, projectId), principal: 'stdio:test', version: '1.0.0' }))
    close.push(serving.close)
    const abort = new AbortController()
    const pending = serving.client.callTool({ name: 'histoire_get_project', arguments: {} }, { signal: abort.signal })
    const signal = await observed.promise
    abort.abort(new Error('SDK caller cancelled'))
    await expect(pending).rejects.toThrow()
    await expect.poll(() => signal.aborted).toBe(true)
    const result = await serving.client.callTool({ name: 'histoire_get_project', arguments: {} })
    expect(result.structuredContent).toMatchObject({ ok: true, data: { status: 'ready' } })
  })

  it('marks public read tools through IPC while keeping resource reads unlabelled', async () => {
    const worker = await fixture(`
if (message.type !== 'request') return;
process.send({ type: 'result', id: message.id, data: { ...project, title: message.readTool ?? 'ordinary-resource-read' } });
`)
    const projectId = (await worker.ready).project.projectId
    const serving = await createMcpTestClient(() => createHistoireMcpServer({ project: createWorkerProject(worker, projectId), principal: 'stdio:test', version: '1.0.0', observeReadTool: worker.observeReadTool }))
    close.push(serving.close)
    const before = await serving.client.readResource({ uri: `histoire://${projectId}/project` })
    expect(JSON.parse((before.contents[0] as { text: string }).text).title).toBe('ordinary-resource-read')
    const tool = await serving.client.callTool({ name: 'histoire_get_project', arguments: {} })
    expect(tool.structuredContent).toMatchObject({ ok: true, data: { title: 'histoire_get_project' } })
    const after = await serving.client.readResource({ uri: `histoire://${projectId}/project` })
    expect(JSON.parse((after.contents[0] as { text: string }).text).title).toBe('ordinary-resource-read')
  })
})
