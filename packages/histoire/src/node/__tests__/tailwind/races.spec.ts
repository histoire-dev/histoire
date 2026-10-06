import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { createTailwindSession } from '../../builtin-plugins/tailwind/session.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createTailwindFixture } from '../utils/tailwind.js'

describe('tailwind generation ownership', () => {
  it('releases initial watcher readiness when closed before its scan finishes', async () => {
    const fixture = await createTailwindFixture(3)
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn(async () => {}) })
    const session = createTailwindSession(fixture.api, {}, true)
    try {
      const load = vi.spyOn(fixture.api.moduleLoader, 'loadModule')
      const waiting = session.watch(Object.assign(fixture.api, { watcher: { watch: () => watcher } }) as any)
      await session.close()
      await waiting
      await session.refresh()
      expect(watcher.close).toHaveBeenCalledOnce()
      expect(load).not.toHaveBeenCalled()
      expect(fixture.ctx.storyFiles).toHaveLength(0)
    }
    finally { await fixture.close() }
  })

  it('coalesces edits and publishes only latest successful generation', async () => {
    const fixture = await createTailwindFixture(3)
    const loaded = deferred()
    const release = deferred()
    const session = createTailwindSession(fixture.api, {}, true)
    try {
      await fixture.write('tailwind.config.ts', `export default {theme:{colors:{brand:'#123456'}}}`)
      const load = fixture.api.moduleLoader.loadModule
      let first = true
      fixture.api.moduleLoader.loadModule = async (file) => {
        const result = await load(file)
        if (first) {
          first = false
          loaded.resolve()
          await release.promise
        }
        return result
      }
      const publish = vi.spyOn(fixture.api, 'addStoryFile')
      const initial = session.refresh()
      await loaded.promise
      await fixture.write('tailwind.config.ts', `export default {theme:{colors:{brand:'#abcdef'}}}`)
      const latest = session.refresh()
      release.resolve()
      await Promise.all([initial, latest])
      expect(publish).toHaveBeenCalledTimes(1)
      expect(await readFile(fixture.ctx.storyFiles[0].path, 'utf8')).toContain('#abcdef')
    }
    finally {
      release.resolve()
      await session.close()
      await fixture.close()
    }
  })

  it('fences pending publication on close without affecting another project', async () => {
    const fixture = await createTailwindFixture(3)
    const other = await createTailwindFixture(3)
    const entered = deferred()
    const release = deferred()
    const session = createTailwindSession(fixture.api, {}, true)
    const otherSession = createTailwindSession(other.api, {}, false)
    try {
      await fixture.write('tailwind.config.ts', 'export default {}')
      await other.write('tailwind.config.ts', 'export default {}')
      const load = fixture.api.moduleLoader.loadModule
      fixture.api.moduleLoader.loadModule = async (file) => {
        entered.resolve()
        await release.promise
        return load(file)
      }
      const pending = session.refresh()
      await entered.promise
      const closing = session.close()
      await otherSession.refresh()
      release.resolve()
      await Promise.all([closing, pending])
      expect(fixture.ctx.storyFiles).toHaveLength(0)
      expect(other.ctx.storyFiles).toHaveLength(1)
      expect(fixture.api.pluginTempDir).not.toBe(other.api.pluginTempDir)
    }
    finally {
      release.resolve()
      await session.close()
      await otherSession.close()
      await fixture.close()
      await other.close()
    }
  })
})
