import type { RestartCause } from '../protocol.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { startDevProxy } from '../../dist/index.js'

/** Project whose runtime startup blocks on a gate server while `hold.on()` is active. */
async function gatedProject() {
  const root = await mkdtemp(join(tmpdir(), 'histoire-proxy-causes-'))
  const file = join(root, 'histoire.config.ts')
  let holding = false
  const held: Array<() => void> = []
  const gate = createServer((_, response) => {
    if (holding) held.push(() => response.end('go'))
    else response.end('go')
  })
  await new Promise<void>(resolve => gate.listen(0, '127.0.0.1', resolve))
  const config = (value: string) => JSON.stringify({ gate: `http://127.0.0.1:${(gate.address() as { port: number }).port}`, value })
  await writeFile(file, config('one'))
  const hold = {
    held,
    on: () => {
      holding = true
    },
    release: () => {
      holding = false
      for (const open of held.splice(0)) open()
    },
  }
  return { root, file, config, gate, hold }
}

// Boundary: real proxy, forked runtime over IPC, real config watcher. The gate
// server holds runtime startup so supersession is deterministic. Defects:
// duplicated or mislabelled restart notices, a fresh request lost when it
// coalesces with another restart, fresh leaking into later generations.
it('reports one labelled cause per transition and keeps a fresh request through coalescing', async () => {
  const { root, file, config, gate, hold } = await gatedProject()
  const causes: RestartCause[] = []
  const starts: boolean[] = []
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), shutdownTimeout: 2000, onRestart: cause => causes.push(cause), onRuntimeStart: ({ fresh }) => starts.push(fresh) })
  const { held, release } = hold
  const served = async () => (await (await fetch(proxy.url)).json()) as { value: string, fresh: boolean }
  try {
    await proxy.ready
    expect(causes).toEqual([])

    await writeFile(file, config('two'))
    // Allow graceful child shutdown (up to two seconds) and a fresh process boot.
    await expect.poll(async () => (await served().catch(() => undefined))?.value, { timeout: 5000 }).toBe('two')
    expect(causes).toEqual([{ kind: 'config', source: 'Histoire: histoire.config.ts', fresh: false }])

    await proxy.restart()
    await fetch(`${proxy.url}__histoire/dev/restart`, { method: 'POST', headers: { origin: new URL(proxy.url).origin } })
    await expect.poll(() => causes.map(cause => cause.kind)).toEqual(['config', 'manual', 'browser'])
    await expect.poll(() => proxy.status).toBe('ready')

    // Ordinary restart in flight (startup held), then a fresh request: the fresh one wins the next generation.
    hold.on()
    starts.length = 0
    const ordinary = proxy.restart()
    await expect.poll(() => held.length).toBe(1)
    const fresh = proxy.restart({ fresh: true })
    release()
    await Promise.all([ordinary, fresh])
    await expect.poll(async () => (await served().catch(() => undefined))?.fresh).toBe(true)
    expect(starts).toEqual([false, true])

    // Fresh generation superseded before ready, by an ordinary request: freshness is not lost.
    hold.on()
    starts.length = 0
    const first = proxy.restart({ fresh: true })
    await expect.poll(() => held.length).toBe(1)
    const second = proxy.restart()
    release()
    await Promise.all([first, second])
    await expect.poll(async () => (await served().catch(() => undefined))?.fresh).toBe(true)
    expect(starts).toEqual([true, true])

    // One-shot: the following ordinary restart is not fresh.
    starts.length = 0
    await proxy.restart()
    expect(starts).toEqual([false])
    expect((await served()).fresh).toBe(false)
  }
  finally {
    release()
    await proxy.close()
    gate.closeAllConnections()
    await new Promise<void>(resolve => gate.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

// Defect: a request recorded while the previous transition is still acquiring is
// not served by it (the coordinator runs another one), but its cause was cleared
// when the first transition settled. A request recorded during teardown is served
// by the transition in flight and must not name the following one.
it('gives each transition the cause of the request that scheduled it', async () => {
  const { root, gate, hold } = await gatedProject()
  const causes: RestartCause[] = []
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), shutdownTimeout: 2000, onRestart: cause => causes.push(cause) })
  try {
    await proxy.ready
    hold.on()
    // Browser request lands during teardown: served by the first transition, which announced as manual.
    const first = proxy.restart()
    const coalesced = proxy.restart({ cause: 'browser' })
    await expect.poll(() => hold.held.length).toBe(1)
    // Fresh request lands during acquisition: needs a second transition naming it.
    const second = proxy.restart({ fresh: true })
    hold.release()
    await Promise.all([first, coalesced, second])
    await expect.poll(() => proxy.status).toBe('ready')
    expect(causes).toEqual([{ kind: 'manual', fresh: false }, { kind: 'manual', fresh: true }])
  }
  finally {
    hold.release()
    await proxy.close()
    gate.closeAllConnections()
    await new Promise<void>(resolve => gate.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
