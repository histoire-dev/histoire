import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentDiscovery } from '../acp/discovery.js'
import { disposeAgentManagers, fakeAgentFile, fakeManager } from './utils/acp.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(async () => {
  await disposeAgentManagers()
  await disposeConfigProjects()
})

describe('agent model and effort defaults', () => {
  it('redacts discovery environment captured by temporary processes, including registry defaults', async () => {
    const { root } = await configTestProject()
    const preset = { id: 'fake', name: 'Fake', command: process.execPath, args: [fakeAgentFile, 'config-secrets'] }
    const discovery = createAgentDiscovery({ root, timeout: 1000, sanitize: text => text })
    try {
      const result = await discovery.discover(preset, {}, async () => ({ preset, environment: { AGENT_TOKEN: 'distribution-secret' } }))
      expect(result.model?.options[0].label).toBe('Small [redacted]')
      expect(JSON.stringify(result)).not.toContain('distribution-secret')
    }
    finally {
      await discovery.close()
    }
  })

  it('discovers grouped models without sending prompts and applies model before dependent effort to comments', async () => {
    const { root, manager } = await fakeManager('config-options')
    await manager.ready
    await manager.configure({ ...manager.snapshot(), presets: manager.snapshot().presets.map(preset => ({ ...preset, model: 'large', effort: 'deep' })) })
    const choices = await manager.configOptions('fake')
    expect(choices.model?.options).toEqual([{ value: 'small', label: 'Small', group: 'Models' }, { value: 'large', label: 'Large', group: 'Models' }])
    expect(choices.effort?.options.map(option => option.value)).toEqual(['quick', 'deep'])
    expect(await readFile(join(root, 'protocol.txt'), 'utf8')).not.toContain('session/prompt')
    const result = await manager.prompt({ threadId: 'one', text: 'Hello' })
    expect(result.text).toBe('model=large effort=deep')
    expect((await manager.prompt({ threadId: 'one', text: 'Again' })).text).toBe(result.text)
  })

  it('keeps default configuration untouched and continues rejected overrides with visible warning', async () => {
    const { root, manager } = await fakeManager('config-options')
    await manager.ready
    await manager.configure({ ...manager.snapshot(), presets: manager.snapshot().presets.map(preset => ({ ...preset, model: 'default' })) })
    expect(manager.snapshot().presets[0].model).toBeUndefined()
    expect((await manager.prompt({ threadId: 'one', text: 'Default' })).text).toBe('model=small effort=quick')
    expect(await readFile(join(root, 'protocol.txt'), 'utf8')).not.toContain('session/set_config_option')
    await manager.configure({ ...manager.snapshot(), presets: manager.snapshot().presets.map(preset => ({ ...preset, model: 'missing' })) })
    expect((await manager.prompt({ threadId: 'two', text: 'Continue' })).text).toBe('model=small effort=quick')
    expect(manager.snapshot().agents[0].warning).toContain('model')
  })

  it('refuses discovery without both opt-ins and suppresses retired probe completion', async () => {
    const { root, manager } = await fakeManager('delayed-config', false)
    await expect(manager.configOptions('fake')).rejects.toThrow('disabled')
    await manager.configure({ ...manager.snapshot(), enabled: true, enabledIds: ['fake'] })
    const probe = manager.configOptions('fake').catch(error => error)
    await expect.poll(async () => readFile(join(root, 'protocol.txt'), 'utf8').catch(() => '')).toContain('session/new')
    await manager.configure({ ...manager.snapshot(), enabledIds: [] })
    expect(await probe).toBeInstanceOf(Error)
    await expect(manager.configOptions('fake')).rejects.toThrow('disabled')
  })

  it('coalesces identical probes, limits temporary processes to two and closes all peers', async () => {
    const { root, manager } = await fakeManager('delayed-config')
    await manager.ready
    await manager.configure({ ...manager.snapshot(), enabledIds: ['fake', 'second', 'third'], presets: ['fake', 'second', 'third'].map(id => ({ ...manager.snapshot().presets[0], id, default: id === 'fake' })) })
    /** Launch journal belongs to real subprocess peer, not a mocked manager. */
    const launches = async () => (await readFile(join(root, 'launches.txt'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(Number)
    const first = manager.configOptions('fake')
    const duplicate = manager.configOptions('fake')
    const second = manager.configOptions('second')
    const third = manager.configOptions('third')
    await expect.poll(async () => (await launches()).length).toBe(2)
    await expect(first).resolves.toEqual(await duplicate)
    await Promise.all([second, third])
    expect(await launches()).toHaveLength(3)
    for (const pid of await launches()) expect(() => process.kill(pid, 0)).toThrow()
  })

  it('retires held discovery on environment rotation and manager teardown', async () => {
    const { root, manager } = await fakeManager('delayed-config')
    const probe = manager.configOptions('fake').catch(error => error)
    await expect.poll(async () => readFile(join(root, 'protocol.txt'), 'utf8').catch(() => '')).toContain('session/new')
    await manager.setEnvironment('fake', { AGENT_TOKEN: 'new-credential' })
    expect(await probe).toBeInstanceOf(Error)
    const next = manager.configOptions('fake').catch(error => error)
    await expect.poll(async () => (await readFile(join(root, 'launches.txt'), 'utf8')).trim().split('\n').length).toBe(2)
    await manager.close()
    expect(await next).toBeInstanceOf(Error)
    for (const pid of (await readFile(join(root, 'launches.txt'), 'utf8')).trim().split('\n').map(Number)) expect(() => process.kill(pid, 0)).toThrow()
  })
})
