import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMcpCliProject } from '../../utils/mcp/cli-project.js'
import { assertMcpProcessReleased, callMcp, closeMcpFixtures, connectMcpHttp, MCP_PROTOCOLS, startMcpProcess, waitMcp } from '../../utils/mcp/process.js'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await closeMcpFixtures(cleanup)
})

describe('built CLI dev HTTP conformance', () => {
  it.each(MCP_PROTOCOLS)('serves six reads and raw resources with %s', async (version, options) => {
    const project = await createMcpCliProject()
    cleanup.push(project.close)
    const runtime = startMcpProcess(['dev', '-c', 'custom config.ts', '--port', '0', '--mcp-port', '0'], project.root)
    cleanup.push(() => runtime.close())
    const endpoint = (await runtime.waitFor(/MCP: (http:\/\/\S+)/))[1]
    const client = await connectMcpHttp(endpoint, options)
    cleanup.push(() => client.close())
    expect(client.getNegotiatedProtocolVersion()).toBe(version)
    expect((await client.listTools()).tools).toHaveLength(14)
    const status = await waitMcp(() => callMcp(client, 'histoire_get_project'), value => value.data?.status === 'ready')
    expect(status.data).toMatchObject({ runtimeMode: 'dev', storyCount: 1 })
    expect(JSON.stringify(status)).not.toContain(project.root)
    const list = await callMcp(client, 'histoire_list_stories')
    expect(list.data.items[0].id).toBe('stdio/a %2E..')
    const story = await callMcp(client, 'histoire_get_story', { storyId: 'stdio/a %2E..' })
    const docs = await callMcp(client, 'histoire_get_docs', { storyId: 'stdio/a %2E..' })
    const source = await callMcp(client, 'histoire_get_source', { storyId: 'stdio/a %2E..' })
    const preview = await callMcp(client, 'histoire_get_preview', { storyId: 'stdio/a %2E..', variantId: 'main' })
    expect(docs.data.text).toBe('# Original documentation 🚀\r\n')
    expect(source.data.text).toBe(project.source)
    expect((await client.readResource({ uri: story.data.resources.docs })).contents[0]).toMatchObject({ text: docs.data.text })
    expect((await client.readResource({ uri: story.data.resources.source })).contents[0]).toMatchObject({ text: project.source })
    expect((await fetch(preview.data.storyUrl)).status).toBe(200)
    expect(await client.callTool({ name: 'histoire_get_project', arguments: { unknown: true } })).toMatchObject({ isError: true })
    expect((await fetch(endpoint, { method: 'POST', headers: { 'Origin': 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403)
    expect((await fetch(`${endpoint}?leak=1`, { method: 'POST', body: '{}' })).status).toBe(404)
    await client.close()
    expect(await runtime.close()).toMatchObject({ code: expect.toSatisfy((code: number) => [0, 143].includes(code)), signal: null })
    await assertMcpProcessReleased(runtime.child, endpoint)
  })

  it('plain dev falls back from occupied default port and drains three owned cycles', async () => {
    const occupied = createServer()
    occupied.listen(6007, '127.0.0.1')
    await once(occupied, 'listening')
    cleanup.push(async () => {
      occupied.close()
      await once(occupied, 'close')
    })
    const project = await createMcpCliProject()
    cleanup.push(project.close)
    for (let cycle = 0; cycle < 3; cycle++) {
      const runtime = startMcpProcess(['dev', '-c', 'custom config.ts', '--port', '0'], project.root)
      cleanup.push(() => runtime.close())
      const endpoint = (await runtime.waitFor(/MCP: (http:\/\/\S+)/))[1]
      expect(new URL(endpoint).hostname).toBe('127.0.0.1')
      expect(new URL(endpoint).port).not.toBe('6007')
      const client = await connectMcpHttp(endpoint)
      cleanup.push(() => client.close())
      expect((await callMcp(client, 'histoire_get_project')).data.status).toBe('ready')
      await client.close()
      const closed = await runtime.close(cycle === 1 ? 'SIGINT' : 'SIGTERM')
      expect(closed.signal).toBeNull()
      expect([0, cycle === 1 ? 130 : 143]).toContain(closed.code)
      await assertMcpProcessReleased(runtime.child, endpoint)
    }
  })

  it('restarts same owner after config change and rejects previous publication', async () => {
    const project = await createMcpCliProject()
    cleanup.push(project.close)
    const runtime = startMcpProcess(['dev', '-c', 'custom config.ts', '--port', '0', '--mcp-port', '0'], project.root)
    cleanup.push(() => runtime.close())
    const endpoint = (await runtime.waitFor(/MCP: (http:\/\/\S+)/))[1]
    const client = await connectMcpHttp(endpoint)
    cleanup.push(() => client.close())
    const before = (await callMcp(client, 'histoire_get_project')).data
    await writeFile(resolve(project.root, 'custom config.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins: [HstVue()], storyMatch: ['*.story.vue'], tree: { groups: [] }, mcp: true };`)
    await runtime.waitFor(/Config changed, restarting/)
    const after = await waitMcp(() => callMcp(client, 'histoire_get_project'), value => value.data?.status === 'ready' && value.data.epoch !== before.epoch)
    expect(after.data.projectId).toBe(before.projectId)
    const stale = await callMcp(client, 'histoire_get_story', { storyId: 'stdio/a %2E..', expectedRevision: before.revision })
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } })
  })

  it.each(['--no-mcp', 'config'])('honors explicit disable through %s', async (mode) => {
    const project = await createMcpCliProject()
    cleanup.push(project.close)
    if (mode === 'config') await writeFile(resolve(project.root, 'custom config.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins: [HstVue()], storyMatch: ['*.story.vue'], mcp: false };`)
    const runtime = startMcpProcess(['dev', '-c', 'custom config.ts', '--port', '0', ...(mode === 'config' ? [] : ['--no-mcp'])], project.root)
    cleanup.push(() => runtime.close())
    await runtime.waitFor(/Local:\s+http:\/\//)
    expect(runtime.output()).not.toContain('MCP:')
    const closed = await runtime.close()
    expect(closed.signal).toBeNull()
    expect([0, 143]).toContain(closed.code)
  })
})
