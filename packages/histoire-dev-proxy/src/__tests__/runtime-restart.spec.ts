import type { RestartCause } from '../protocol.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
// Source entry: the restart request is under test before any dist rebuild.
import { startDevProxy } from '../index.js'

// Boundary: real proxy and forked runtime over IPC. Defects: a runtime restart request
// replaced inside the same process, losing its fresh flag or label, or a retired
// generation scheduling another replacement.
it('replaces the runtime process when the ready generation asks for it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'histoire-proxy-runtime-restart-'))
  await writeFile(join(root, 'histoire.config.ts'), JSON.stringify({ value: 'one' }))
  const causes: RestartCause[] = []
  const generations: string[] = []
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), shutdownTimeout: 2000, onRestart: cause => causes.push(cause), onRuntimeStart: ({ generation }) => generations.push(generation) })
  const served = async () => (await (await fetch(proxy.url)).json()) as { pid: number, fresh: boolean }
  try {
    await proxy.ready
    const before = await served()
    const sent = await proxy.sendRuntimeCommand({ id: '1', operation: 'request-restart', args: { source: 'Installed acme-plugin', fresh: true } })
    expect(sent.ok).toBe(true)
    // The startup page answers while the successor boots; wait for a served runtime.
    await expect.poll(async () => {
      const state = await served().catch(() => undefined)
      return state && state.pid !== before.pid ? state.fresh : undefined
    }).toBe(true)
    expect(causes).toEqual([{ kind: 'runtime', source: 'Installed acme-plugin', fresh: true }])

    // A frame addressed to the retired generation is ignored by the parent.
    await proxy.sendRuntimeCommand({ id: '2', operation: 'request-restart', args: { generation: generations[0], source: 'Stale request' } })
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(causes).toHaveLength(1)
  }
  finally {
    await proxy.close()
    await rm(root, { recursive: true, force: true })
  }
})
