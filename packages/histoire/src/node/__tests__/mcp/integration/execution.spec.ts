import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMcpTestBodyMarker, createMcpArtifactProject } from '../../utils/mcp/artifact-project.js'
import { createMcpBrowserTestProject } from '../../utils/mcp/browser-test-project.js'
import { MCP_BUILT_CLI } from '../../utils/mcp/cli-project.js'
import { assertMcpProcessReleased, callMcp, connectMcpHttp, createMcpProcessEnvironment, MCP_PROTOCOLS, startMcpProcess, waitMcp } from '../../utils/mcp/process.js'

const token = 'cd'.repeat(32)
let artifact: Awaited<ReturnType<typeof createMcpArtifactProject>>
let dev: Awaited<ReturnType<typeof createMcpBrowserTestProject>>
let notifyBody: (() => void) | undefined
const marker = createServer((_request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.end('entered')
  notifyBody?.()
})
beforeAll(async () => {
  marker.listen(0, '127.0.0.1')
  await once(marker, 'listening')
  const address = marker.address()
  if (!address || typeof address === 'string') throw new Error('Body marker did not bind')
  const endpoint = `http://127.0.0.1:${address.port}/entered`
  dev = await createMcpBrowserTestProject()
  await addMcpTestBodyMarker(dev.root, endpoint)
  artifact = await createMcpArtifactProject(false, 'hash', endpoint)
  await artifact.addPlaywright()
})
afterAll(async () => {
  await dev?.close()
  await artifact?.close()
  marker.close()
  await once(marker, 'close')
})

/** Poll exact public operation; terminal test failures still complete normally. */
async function terminal(client: Client, operationId: string) {
  return (await waitMcp(() => callMcp(client, 'histoire_get_operation', { operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state))).data
}

describe.each(['dev', 'node', 'stdio'])('%s browser job conformance', (mode) => {
  it.each(MCP_PROTOCOLS)('runs screenshot/tests/retry/cancel using %s', async (version, options) => {
    const runtime = mode === 'stdio'
      ? undefined
      : mode === 'dev'
        ? startMcpProcess(['dev', '-c', 'custom config.ts', '--port', '0', '--mcp-port', '0'], dev.root)
        : startMcpProcess([], artifact.unrelated, { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: token }, resolve(artifact.artifact, 'server.mjs'))
    let client: Client | undefined
    let secondClient: Client | undefined
    let stdio: StdioClientTransport | undefined
    try {
      if (mode === 'stdio') {
        stdio = new StdioClientTransport({ command: process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, args: [MCP_BUILT_CLI, 'mcp', '--root', dev.root, '-c', 'custom config.ts'], cwd: '/tmp', stderr: 'pipe', env: createMcpProcessEnvironment() as Record<string, string> })
        stdio.stderr.resume()
        client = new Client({ name: 'histoire-stdio-browser-conformance', version: '1' }, options)
        await client.connect(stdio)
        secondClient = client
      }
      else {
        const endpoint = (await runtime!.waitFor(mode === 'dev' ? /MCP: (http:\/\/\S+)/ : /Histoire MCP: (http:\/\/\S+)/))[1]
        client = await connectMcpHttp(endpoint, options, mode === 'node' ? token : undefined)
        secondClient = await connectMcpHttp(endpoint, options, mode === 'node' ? token : undefined)
      }
      expect(client.getNegotiatedProtocolVersion()).toBe(version)
      const status = await waitMcp(() => callMcp(client!, 'histoire_get_project'), value => value.data?.status === 'ready')
      const engine = mode === 'node' ? 'built-preview' : 'project-vitest'
      expect(status.data.capabilities.tests).toMatchObject({ available: true, engine })
      if (mode === 'node') {
        const unavailable = await callMcp(client, 'histoire_get_source', { storyId: 'test-book' })
        expect(unavailable).toMatchObject({ ok: false, error: { code: 'SOURCE_UNAVAILABLE' } })
      }
      const parameters = { storyId: 'test-book', variantId: 'normal', width: 480, height: 320, requestKey: `png-${mode}-${version}` }
      const admitted = await callMcp(client, 'histoire_capture_screenshot', parameters)
      expect(admitted.ok).toBe(true)
      // Retry same admission after caller discarded response; no second effect.
      expect((await callMcp(secondClient, 'histoire_capture_screenshot', parameters)).data.operationId).toBe(admitted.data.operationId)
      const screenshot = await terminal(client, admitted.data.operationId)
      expect(screenshot).toMatchObject({ state: 'completed', result: { width: 480, height: 320 } })
      const resource = await client.readResource({ uri: screenshot.result.artifactUri })
      const bytes = Buffer.from((resource.contents[0] as any).blob, 'base64')
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(bytes.readUInt32BE(16)).toBe(480)
      expect(bytes.readUInt32BE(20)).toBe(320)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(screenshot.result.sha256)
      for (const [storyId, variantId, failed, total] of [['test-book', 'normal', 0, 4], ['test-book', 'fail', 1, 4], ['test-book', 'timeout', 1, 4], ['empty', 'normal', 0, 0]] as const) {
        const job = await callMcp(client, 'histoire_run_tests', { storyId, variantId, requestKey: `${mode}-${version}-${storyId}-${variantId}` })
        expect(job.ok).toBe(true)
        const completed = await terminal(client, job.data.operationId)
        expect(completed).toMatchObject({ state: 'completed', result: { engine, summary: { failed, total } } })
        if (total) expect(completed.result.summary.skipped).toBe(1)
      }
      let signalBody!: () => void
      let bodyObserved = false
      const bodyEntered = new Promise<void>((resolve) => {
        signalBody = resolve
      })
      notifyBody = () => {
        bodyObserved = true
        signalBody()
      }
      const slow = await callMcp(client, 'histoire_run_tests', { storyId: 'test-book', variantId: 'slow', requestKey: `slow-${mode}-${version}` })
      expect(slow.ok).toBe(true)
      const bodyDeadline = setTimeout(() => signalBody(), 40000)
      try {
        await bodyEntered
        expect(bodyObserved).toBe(true)
        expect((await callMcp(client, 'histoire_get_operation', { operationId: slow.data.operationId })).data.state).toBe('running')
      }
      finally { clearTimeout(bodyDeadline) }
      const afterCancel = await callMcp(secondClient, 'histoire_run_tests', { storyId: 'empty', variantId: 'normal', requestKey: `after-cancel-${mode}-${version}` })
      expect(afterCancel.data.state).toBe('queued')
      const cancellation = await callMcp(client, 'histoire_cancel_operation', { operationId: slow.data.operationId })
      expect(cancellation.ok).toBe(true)
      expect(await terminal(client, slow.data.operationId)).toMatchObject({ state: 'cancelled' })
      notifyBody = undefined
      expect(await terminal(client, afterCancel.data.operationId)).toMatchObject({ state: 'completed', result: { summary: { ok: true } } })
      const ownedStdioPid = stdio?.pid
      const preview = await callMcp(client, 'histoire_get_preview', { storyId: 'test-book', variantId: 'normal' })
      await secondClient.close()
      await client.close()
      if (runtime) {
        const closed = await runtime.close()
        expect(closed.signal).toBeNull()
        expect(mode === 'dev' ? [0, 143] : [0]).toContain(closed.code)
      }
      else {
        expect(typeof ownedStdioPid).toBe('number')
        await assertMcpProcessReleased({ pid: ownedStdioPid }, preview.data.storyUrl)
      }
    }
    finally {
      notifyBody = undefined
      await secondClient?.close()
      await client?.close()
      await runtime?.close()
    }
  }, 180000)
})
