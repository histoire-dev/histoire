import type { Context } from '../context.js'
import type { RuntimeGeneration } from '../runtime/types.js'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { configFileHash } from '../config/codemod/index.js'
import { watchProjectConfiguration } from '../runtime/config-watchers.js'
import { onVerifiedConfigSave } from '../server/ui-channel/config-receipts.js'
import { registerConfigChannel } from '../server/ui-channel/config.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'
import { uiChannelFixture } from './utils/ui-channel.js'

afterEach(disposeConfigProjects)

describe('project save completion across runtime replacement', () => {
  it('recovers verified save from successor only and refuses later disk changes', async () => {
    const source = 'const config = { ui: { defaultArrange: "grid" } }; await new Promise(resolve => setTimeout(resolve, 150)); export default config'
    const { root, file } = await configTestProject(source)
    let active = true
    let restarts = 0
    const previous = { root, config: { ui: { defaultArrange: 'grid' } } } as Context
    const old = uiChannelFixture(() => active)
    registerConfigChannel(previous, old.channel, () => active)
    const stopWatch = await watchProjectConfiguration({ context: previous } as RuntimeGeneration, {}, () => {
      active = false
      restarts++
    })
    const requestId = randomUUID()
    try {
      await old.request('histoire:ui:config-save', { requestId, expectedHash: await configFileHash(file, { root }), patches: [{ path: 'ui.defaultArrange', value: 'list' }] })
      expect(active).toBe(false)
      expect(restarts).toBe(1)
      expect(old.client.send.mock.calls.some(call => call[1].saved)).toBe(false)
      expect(await readFile(file, 'utf8')).toContain('defaultArrange: "list"')
    }
    finally {
      await stopWatch()
      await old.channel.close()
    }
    const current = uiChannelFixture()
    const nextContext = { root, config: { ui: { defaultArrange: 'list' } } } as Context
    let verified = 0
    const stopVerified = onVerifiedConfigSave(nextContext, async (paths) => {
      expect(paths).toEqual(['ui.defaultArrange'])
      verified++
    })
    registerConfigChannel(nextContext, current.channel)
    try {
      await current.request('histoire:ui:config-read', { paths: ['ui.defaultArrange'], requestId })
      expect(current.client.send.mock.lastCall?.[1]).toMatchObject({ requestId, saved: ['ui.defaultArrange'], completion: 'saved' })
      expect(verified).toBe(1)
      await writeFile(file, 'export default { ui: { defaultArrange: "grid" } }')
      await current.request('histoire:ui:config-read', { paths: ['ui.defaultArrange'], requestId })
      expect(current.client.send.mock.lastCall?.[1]).toMatchObject({ requestId, completion: 'failed', error: expect.stringContaining('conflict') })
      expect(current.client.send.mock.lastCall?.[1].saved).toBeUndefined()
      expect(current.ws.send).not.toHaveBeenCalled()
      expect(verified).toBe(1)
    }
    finally {
      stopVerified()
      await current.channel.close()
    }
  })

  it('does not acknowledge matching disk bytes through ineffective project config', async () => {
    const { root, file } = await configTestProject('export default { ui: { defaultArrange: "grid" } }')
    const old = uiChannelFixture()
    registerConfigChannel({ root, config: { ui: { defaultArrange: 'grid' } } } as Context, old.channel)
    const requestId = randomUUID()
    await old.request('histoire:ui:config-save', { requestId, expectedHash: await configFileHash(file, { root }), patches: [{ path: 'ui.defaultArrange', value: 'list' }] })
    await old.channel.close()
    const next = uiChannelFixture()
    registerConfigChannel({ root, config: { ui: { defaultArrange: 'grid' } } } as Context, next.channel)
    try {
      await next.request('histoire:ui:config-read', { paths: ['ui.defaultArrange'], requestId })
      expect(next.client.send.mock.lastCall?.[1]).toMatchObject({ completion: 'failed', error: expect.stringContaining('effective') })
      expect(next.client.send.mock.lastCall?.[1].saved).toBeUndefined()
    }
    finally { await next.channel.close() }
  })

  it('recovers first JavaScript config destination without assuming TypeScript', async () => {
    const { root } = await configTestProject()
    await mkdir(join(root, 'node_modules'))
    await symlink(fileURLToPath(new URL('../../../..', import.meta.url)), join(root, 'node_modules/histoire'), 'dir')
    const old = uiChannelFixture()
    registerConfigChannel({ root, config: { ui: { defaultArrange: 'grid' } } } as Context, old.channel)
    const requestId = randomUUID()
    await old.request('histoire:ui:config-save', { requestId, patches: [{ path: 'ui.defaultArrange', value: 'list' }] })
    await old.channel.close()
    const next = uiChannelFixture()
    registerConfigChannel({ root, config: { ui: { defaultArrange: 'list' } } } as Context, next.channel)
    try {
      await next.request('histoire:ui:config-read', { paths: ['ui.defaultArrange'], requestId })
      expect(next.client.send.mock.lastCall?.[1]).toMatchObject({ file: 'histoire.config.js', saved: ['ui.defaultArrange'], completion: 'saved' })
    }
    finally { await next.channel.close() }
  })
})
