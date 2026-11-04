import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { startDevProxy } from '../../dist/index.js'

// Boundary: real proxy and forked runtime over actual IPC/stdio. The fixture is
// the external runtime peer. Defects: observers losing or duplicating output,
// commands queued onto unready successors, late replies settling after retirement.
const runtime = new URL('./fixtures/runtime.mjs', import.meta.url)

/** Starts a proxy over a temporary project whose fixture config is `config`. */
async function withProxy(config: object, options: Partial<Parameters<typeof startDevProxy>[0]>, body: (proxy: Awaited<ReturnType<typeof startDevProxy>>, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'histoire-proxy-channel-'))
  await writeFile(join(root, 'histoire.config.ts'), JSON.stringify(config))
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime, shutdownTimeout: 2000, ...options })
  try {
    await body(proxy, root)
  }
  finally {
    await proxy.close()
    await rm(root, { recursive: true, force: true })
  }
}

it('keeps piping runtime output without an observer', async () => {
  const write = vi.spyOn(process.stdout, 'write')
  try {
    await withProxy({ output: true }, {}, async (proxy) => {
      await proxy.ready
      await expect.poll(() => write.mock.calls.map(call => String(call[0])).join('')).toContain('fixture-out line')
    })
  }
  finally {
    write.mockRestore()
  }
})

it('delivers each output chunk once to an observer instead of piping it', async () => {
  const write = vi.spyOn(process.stdout, 'write')
  const seen: Record<string, string> = { stdout: '', stderr: '' }
  const ended = new Set<string>()
  try {
    await withProxy({ output: true }, { onOutput: ({ stream, chunk }) => chunk ? void (seen[stream] += chunk.toString()) : void ended.add(stream) }, async (proxy) => {
      await proxy.ready
      await expect.poll(() => seen.stderr).toBe('fixture-err\n')
      expect(seen.stdout).toBe('fixture-out line\n')
      expect(write.mock.calls.map(call => String(call[0])).join('')).not.toContain('fixture-out')
    })
    expect([...ended].sort()).toEqual(['stderr', 'stdout'])
  }
  finally {
    write.mockRestore()
  }
})

it('delivers commands only to the ready generation and fences replies after retirement', async () => {
  const messages: unknown[] = []
  const retired: string[] = []
  await withProxy({}, { onRuntimeMessage: message => messages.push(message), onRuntimeRetired: generation => retired.push(generation) }, async (proxy) => {
    expect(await proxy.sendRuntimeCommand({ id: 'early', operation: 'echo' })).toEqual({ ok: false, reason: 'starting' })
    await proxy.ready
    const sent = await proxy.sendRuntimeCommand({ id: 'a', operation: 'echo', args: { n: 1 } })
    expect(sent.ok).toBe(true)
    await expect.poll(() => messages).toMatchObject([{ type: 'runtime-reply', id: 'a', ok: true, result: { args: { n: 1 } } }])
    const first = (sent as { generation: string }).generation
    await proxy.sendRuntimeCommand({ id: 'held', operation: 'hold' })
    const restarting = proxy.restart()
    await expect.poll(() => retired).toEqual([first])
    await restarting
    // The held reply was emitted during winddown and must have been dropped.
    expect(messages.filter(message => (message as { id?: string }).id === 'held')).toEqual([])
    const second = await proxy.sendRuntimeCommand({ id: 'b', operation: 'echo' })
    expect(second).toMatchObject({ ok: true })
    expect((second as { generation: string }).generation).not.toBe(first)
    await expect.poll(() => messages.map(message => (message as { id?: string }).id)).toContain('b')
  })
}, 20_000)
