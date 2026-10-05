import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { launchAgentProcess } from '../acp/agent-process.js'

/** A zombie has terminated; Linux containers may defer its external reaping. */
async function running(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0)
    if (process.platform === 'linux') return !/^State:\s+Z/m.test(await readFile(`/proc/${pid}/status`, 'utf8'))
    return true
  }
  catch { return false }
}

describe('owned ACP process descendants', () => {
  it.skipIf(process.platform === 'win32').each(['independent', 'inherited'])('stops %s worker pipes after direct adapter exits', async (mode) => {
    const file = fileURLToPath(new URL('./fixtures/acp/worker-tree.mjs', import.meta.url))
    const owned = launchAgentProcess({ id: 'fake', name: 'Fake', command: process.execPath, args: [file, mode] }, process.cwd(), {})
    let worker = 0
    try {
      worker = await new Promise<number>((resolve, reject) => {
        owned.child.stdout.once('data', value => resolve(Number(value.toString().trim())))
        owned.child.once('error', reject)
      })
      expect(await running(worker)).toBe(true)
      const stop = owned.stop()
      const finished = await Promise.race([stop.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2500))])
      expect(finished).toBe(true)
      expect(await running(worker)).toBe(false)
      await owned.exited
      expect(owned.stop()).toBe(stop)
    }
    finally {
      if (worker && await running(worker)) process.kill(worker, 'SIGKILL')
      await owned.stop()
    }
  })
})
