import type { TestOperationDto } from '@histoire/cli/protocol/tests'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startDevProxy } from '@histoire/dev-proxy'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTerminalBridge } from '../../../../../../histoire-cli/src/terminal/bridge.js'
import { createTestsClient } from '../../../../../../histoire-cli/src/terminal/tests/client.js'
import { createTestsState } from '../../../../../../histoire-cli/src/terminal/tests/state.js'
import { addMcpTestBodyMarker } from '../../utils/mcp/artifact-project.js'
import { createMcpBrowserTestProject } from '../../utils/mcp/browser-test-project.js'
import { callMcp, connectMcpHttp, waitMcp } from '../../utils/mcp/process.js'
import { startBodyMarker } from '../../utils/terminal/body-marker.js'

// Boundary: built dev-child (real Vite, collector, execution lane, browser
// Vitest) behind the real proxy/IPC/bridge, driven through the typed parent
// client and cache exactly as the Tests view will. MCP is a second real owner of
// the same lane. Defects: wrong target scope, counts that differ from the
// independently known fixture totals, terminal cancel touching MCP work or
// freeing the lane early, runner failures stopping the dev server.
const childUrl = new URL('../../../../../dist/node/commands/dev-child.js', import.meta.url)
let fixture: Awaited<ReturnType<typeof createMcpBrowserTestProject>>
let marker: Awaited<ReturnType<typeof startBodyMarker>>

let savedEnvironment: NodeJS.ProcessEnv
beforeAll(async () => {
  // The runtime must resolve project packages like an installed consumer, not through pnpm's runner paths.
  savedEnvironment = { ...process.env }
  delete process.env.NODE_PATH
  delete process.env.NODE_OPTIONS
  process.env.BROWSER = 'none'
  marker = await startBodyMarker()
  fixture = await createMcpBrowserTestProject()
  await addMcpTestBodyMarker(fixture.root, marker.url)
})
afterAll(async () => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, savedEnvironment)
  await fixture?.close()
  marker.close()
})

/** Starts the real runtime child under the proxy with the terminal bridge/cache wired like `dev.ts`. */
async function startSession(root: string, extra: Record<string, unknown> = {}) {
  let proxy: Awaited<ReturnType<typeof startDevProxy>> | undefined
  let output = ''
  const bridge = createTerminalBridge({ timeoutMs: 20_000, transport: { send: async command => proxy ? proxy.sendRuntimeCommand(command) : { ok: false, reason: 'starting' } } })
  const client = createTestsClient(bridge)
  const state = createTestsState({ client })
  state.attach(bridge)
  proxy = await startDevProxy({ root, config: 'custom config.ts', port: 0, host: '127.0.0.1', runtime: childUrl, runtimeOptions: { config: 'custom config.ts', projectId: 'terminal-tests', ...extra }, shutdownTimeout: 20_000, onOutput: chunk => void (output += chunk.chunk?.toString() ?? ''), onRuntimeMessage: bridge.receive, onRuntimeRetired: (generation) => {
    bridge.retire(generation)
    state.onRetired(generation)
  }, onDiagnostic: () => {} })
  await proxy.ready
  /** Admits a run, retrying only the documented "catalog not ready" refusal. */
  const run = async (...args: Parameters<typeof client.run>) => {
    const deadline = Date.now() + 60_000
    for (;;) {
      try {
        return await client.run(...args)
      }
      catch (error) {
        if ((error as { code?: string }).code !== 'unavailable' || Date.now() > deadline) throw error
        await new Promise(done => setTimeout(done, 100))
      }
    }
  }
  /** Waits for a final state published by event. */
  const final = async (id: string): Promise<TestOperationDto> => {
    await expect.poll(() => state.get(id)?.operation.state, { timeout: 120_000 }).toMatch(/completed|failed|cancelled/)
    return state.get(id)!.operation
  }
  return { proxy, bridge, client, state, run, final, output: () => output, async close() {
    await proxy!.close()
    bridge.close()
  } }
}

describe('terminal browser tests', () => {
  it('runs exact variant, story, empty story and All with the fixture\'s known totals', async () => {
    const session = await startSession(fixture.root)
    try {
      const variant = await session.final((await session.run({ scope: 'variant', storyId: 'test-book', variantId: 'fail' })).id)
      expect(variant).toMatchObject({ state: 'completed', summary: { ok: false, total: 4, passed: 2, failed: 1, skipped: 1 } })
      const page = await session.state.results(variant.id, { failedOnly: true })
      expect(page.cases).toHaveLength(1)
      expect(page.cases[0]).toMatchObject({ storyId: 'test-book', variantId: 'fail', state: 'failed' })
      expect(page.cases[0].errors.length).toBeGreaterThan(0)

      const empty = await session.final((await session.run({ scope: 'story', storyId: 'empty' })).id)
      expect(empty).toMatchObject({ state: 'completed', summary: { ok: true, total: 0, retainedCases: 0 } })

      await expect(session.client.run({ scope: 'variant', storyId: 'test-book', variantId: 'ghost' })).rejects.toMatchObject({ code: 'invalid' })

      // 4 variants (pass / assertion / timeout / hang until the case deadline), empty story contributes nothing.
      const all = await session.final((await session.run({ scope: 'all' })).id)
      expect(all).toMatchObject({ state: 'completed', summary: { ok: false, total: 16, passed: 9, failed: 3, skipped: 4, omittedCases: 0 } })
      const failures = await session.state.results(all.id, { failedOnly: true })
      expect(failures.cases.map(test => test.variantId).sort()).toEqual(['fail', 'slow', 'timeout'])
      // Assertion failures never changed server availability.
      expect((await fetch(session.proxy.url)).status).toBe(200)
    }
    finally { await session.close() }
  }, 240_000)

  it('shares the lane with MCP: terminal cancel keeps the other job and frees the lane only after cleanup', async () => {
    const session = await startSession(fixture.root, { 'mcp': true, 'mcp-port': 0 })
    let mcp: Awaited<ReturnType<typeof connectMcpHttp>> | undefined
    try {
      await waitMcp(async () => /MCP: http:\/\/\S+/.test(session.output()), Boolean)
      mcp = await connectMcpHttp(/MCP: (http:\/\/\S+)/.exec(session.output())![1])
      await waitMcp(() => callMcp(mcp!, 'histoire_get_project'), value => value.data?.status === 'ready' && !value.data.updating)
      const entered = marker.next()
      const slow = await session.run({ scope: 'variant', storyId: 'test-book', variantId: 'slow' })
      await entered
      await expect.poll(() => session.state.get(slow.id)?.operation.state).toBe('running')
      const other = await callMcp(mcp, 'histoire_run_tests', { storyId: 'empty', variantId: 'normal', requestKey: 'after-terminal-cancel' })
      expect(other.ok).toBe(true)
      expect(other.data.state).toBe('queued')

      expect((await session.client.cancel(slow.id)).cancelRequested).toBe(true)
      expect((await session.final(slow.id)).state).toBe('cancelled')
      const done = await waitMcp(() => callMcp(mcp!, 'histoire_get_operation', { operationId: other.data.operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state))
      expect(done.data).toMatchObject({ state: 'completed', result: { summary: { ok: true } } })
    }
    finally {
      await mcp?.close()
      await session.close()
    }
  }, 240_000)

  it('fails with the actionable preflight error when browser dependencies are missing, without stopping the dev server', async () => {
    const missing = await createMcpBrowserTestProject()
    try {
      await rm(resolve(missing.root, 'node_modules/playwright'), { force: true })
      const session = await startSession(missing.root)
      try {
        const operation = await session.final((await session.run({ scope: 'story', storyId: 'empty' })).id)
        expect(operation).toMatchObject({ state: 'failed', failure: { code: 'DEPENDENCY_MISSING' } })
        expect(operation.failure!.message).toMatch(/playwright/)
        expect((await fetch(session.proxy.url)).status).toBe(200)
        // Nothing was installed.
        await expect(import('node:fs/promises').then(fs => fs.access(resolve(missing.root, 'node_modules/playwright')))).rejects.toThrow()
      }
      finally { await session.close() }
    }
    finally { await missing.close() }
  }, 120_000)

  it('retires a held run with its generation; the successor starts clean and the lost run is never reconstructed', async () => {
    const session = await startSession(fixture.root)
    try {
      const entered = marker.next()
      const held = await session.run({ scope: 'variant', storyId: 'test-book', variantId: 'slow' })
      await entered
      await session.proxy.restart()
      await session.proxy.ready
      expect(session.state.get(held.id)).toMatchObject({ lost: true })
      expect(await session.state.results(held.id)).toMatchObject({ unavailable: 'retired' })
      // The successor knows nothing of the old run and never completes it.
      await expect(session.client.get(held.id)).rejects.toMatchObject({ code: 'invalid' })
      const next = await session.final((await session.run({ scope: 'story', storyId: 'empty' })).id)
      expect(next.state).toBe('completed')
      expect(session.state.get(held.id)!.operation.state).not.toBe('completed')
    }
    finally {
      await session.close()
    }
  }, 240_000)
})
