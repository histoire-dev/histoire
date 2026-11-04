import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDevProxy } from '@histoire/dev-proxy'
import { expect, it } from 'vitest'
import { createTerminalBridge } from '../terminal/bridge.js'
import { createLogHistory } from '../terminal/output/history.js'
import { createOutputPipeline } from '../terminal/output/pipeline.js'

// Boundary: built dev-proxy, a forked runtime peer over real IPC/stdio, and the
// parent output pipeline + bridge wired exactly as `dev.ts` wires them (visible
// sinks omitted). Defects: lost or mangled child output, pending reads hanging
// across restart, late old-generation replies reaching the successor.
it('retains complete bounded child output and fences bridge reads across generations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'histoire-terminal-'))
  await writeFile(join(root, 'histoire.config.ts'), '{}')
  const history = createLogHistory()
  const output = createOutputPipeline({ history })
  let proxy: Awaited<ReturnType<typeof startDevProxy>> | undefined
  const bridge = createTerminalBridge({ timeoutMs: 5000, transport: { send: async command => proxy ? proxy.sendRuntimeCommand(command) : { ok: false, reason: 'starting' } } })
  bridge.subscribe(({ event, data, generation }) => event === 'log' && output.onLog(data, generation))
  proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), shutdownTimeout: 3000, onOutput: output.onOutput, onRuntimeMessage: bridge.receive, onRuntimeRetired: bridge.retire, onDiagnostic: output.onDiagnostic })
  try {
    await proxy.ready
    await expect.poll(() => history.entries().map(entry => entry.text)).toEqual(expect.arrayContaining(['smile 😀 end', '100%', 'after big', 'failure', 'from console']))
    const big = history.entries().find(entry => entry.text.startsWith('aaaa'))!
    expect(big.text).toHaveLength(16 * 1024)
    expect(big.truncated).toBe(40_000 - 16 * 1024)
    expect(history.entries().find(entry => entry.text === 'from console')).toMatchObject({ source: 'console', level: 'warn' })
    expect(history.entries().some(entry => entry.text.includes('10%') || entry.text.includes('\x1B'))).toBe(false)

    await expect((bridge.send as (operation: string, args: unknown) => Promise<unknown>)('echo', { a: 1 })).resolves.toEqual({ echo: { a: 1 } })
    // A read pending while its generation retires rejects; the late reply emitted during winddown is fenced.
    const held = (bridge.send as (operation: string, args: unknown) => Promise<unknown>)('hold', {})
    const rejected = expect(held).rejects.toMatchObject({ code: 'retired' })
    await expect.poll(() => bridge.pending).toBe(1)
    await proxy.restart()
    await rejected
    expect(bridge.pending).toBe(0)
    await expect((bridge.send as (operation: string, args: unknown) => Promise<unknown>)('echo', { b: 2 })).resolves.toEqual({ echo: { b: 2 } })
  }
  finally {
    await proxy.close()
    bridge.close()
    output.flush()
    await rm(root, { recursive: true, force: true })
  }
  // Stream end flushed the unterminated tail of the last runtime.
  expect(history.entries().filter(entry => entry.text === 'unterminated').length).toBeGreaterThanOrEqual(1)
}, 30_000)
