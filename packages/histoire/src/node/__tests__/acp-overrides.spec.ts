import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { disposeAgentManagers, fakeManager, testAgentManager } from './utils/acp.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(async () => {
  await disposeAgentManagers()
  await disposeConfigProjects()
})

describe('aCP field-level project overrides', () => {
  it('projects only public preset fields from raw project config', async () => {
    const { root } = await configTestProject()
    const preset = { id: 'fake', name: 'Private config', command: 'not-launched', args: ['--acp'], cwd: 'src', default: true, env: { TOKEN: 'project-private-value' } }
    const manager = testAgentManager({ root, dataFile: join(root, 'agents.json'), config: { presets: [preset] } })
    await manager.ready
    expect(manager.snapshot().presets).toEqual([{ id: 'fake', name: 'Private config', command: 'not-launched', args: ['--acp'], cwd: 'src', default: true }])
    expect(JSON.stringify(manager.snapshot())).not.toContain('project-private-value')
  })

  it('inherits fresh presets/policies after only local context changes and preserves private env', async () => {
    const { root, manager } = await fakeManager('normal', false)
    const file = join(root, 'user/agents.json')
    await manager.ready
    await manager.setEnvironment('fake', { AGENT_TOKEN: 'private-test-value' })
    await manager.configure({ ...manager.snapshot(), context: { ...manager.snapshot().context, askEachTime: true } })
    const saved = JSON.parse(await readFile(file, 'utf8'))
    expect(saved.projects[root]).toEqual({ context: { askEachTime: true } })
    await manager.close()
    const second = testAgentManager({ root, dataFile: file, config: { presets: [{ id: 'fresh', name: 'Fresh project', command: 'not-launched' }], permissions: { fileEdits: 'never', terminal: 'never' } } })
    await second.ready
    expect(second.snapshot()).toMatchObject({ presets: [{ id: 'fresh' }], permissions: { fileEdits: 'never', terminal: 'never' }, context: { askEachTime: true } })
    expect(JSON.stringify(second.snapshot())).not.toContain('private-test-value')
    expect(JSON.parse(await readFile(file, 'utf8')).env.fake.AGENT_TOKEN).toBe('private-test-value')
  })

  it('preserves only edited permission field while other policy defaults change', async () => {
    const { root, manager } = await fakeManager('normal', false)
    const file = join(root, 'user/agents.json')
    await manager.ready
    await manager.configure({ ...manager.snapshot(), permissions: { ...manager.snapshot().permissions, fileEdits: 'allow-src' } })
    expect(JSON.parse(await readFile(file, 'utf8')).projects[root]).toEqual({ permissions: { fileEdits: 'allow-src' } })
    await manager.close()
    const next = testAgentManager({ root, dataFile: file, config: { permissions: { fileEdits: 'never', terminal: 'never' } } })
    await next.ready
    expect(next.snapshot().permissions).toEqual({ fileEdits: 'allow-src', terminal: 'never' })
  })

  it('retires only verified saved paths without dropping opt-ins, context, credentials or other project', async () => {
    const { root, manager } = await fakeManager('normal', false)
    const file = join(root, 'user/agents.json')
    await manager.ready
    await manager.setEnvironment('fake', { TOKEN: 'private-preserved' })
    await manager.configure({ ...manager.snapshot(), enabled: true, enabledIds: ['fake'], presets: [{ id: 'fake', name: 'Local', command: 'local-command' }], permissions: { fileEdits: 'allow-src', terminal: 'ask' }, context: { ...manager.snapshot().context, askEachTime: true } })
    const disk = JSON.parse(await readFile(file, 'utf8'))
    disk.projects.unrelated = { context: { attachScreenshot: false } }
    await writeFile(file, JSON.stringify(disk))
    const project = { enabled: false, presets: [{ id: 'fake', name: 'Local', command: 'local-command' }], permissions: { fileEdits: 'never' as const, terminal: 'never' as const } }
    await manager.retireProjectOverrides(['theme.defaultColorScheme', 'agents.presets'], project)
    expect(manager.snapshot()).toMatchObject({ enabled: true, enabledIds: ['fake'], presets: [{ name: 'Local', command: 'local-command' }], permissions: { fileEdits: 'allow-src', terminal: 'never' }, context: { askEachTime: true } })
    const saved = JSON.parse(await readFile(file, 'utf8'))
    expect(saved.projects[root].presets).toBeUndefined()
    expect(saved.projects[root].permissions).toEqual({ fileEdits: 'allow-src' })
    expect(saved.projects.unrelated).toEqual(disk.projects.unrelated)
    expect(saved.env.fake.TOKEN).toBe('private-preserved')
    await manager.resetProjectOverrides(['agents.permissions'])
    expect(manager.snapshot().permissions).toEqual(project.permissions)
    expect(JSON.parse(await readFile(file, 'utf8')).projects[root]).toMatchObject({ enabled: true, enabledIds: ['fake'], context: { askEachTime: true } })
  })

  it('keeps newer local edits to a saved path while accepting fresh project defaults', async () => {
    const { root, manager } = await fakeManager('normal', false)
    await manager.ready
    await manager.configure({ ...manager.snapshot(), presets: [{ id: 'fake', name: 'Submitted', command: 'submitted-command' }] })
    await manager.configure({ ...manager.snapshot(), presets: [{ id: 'fake', name: 'Newer', command: 'newer-command' }] })
    await manager.retireProjectOverrides(['agents.presets'], { presets: [{ id: 'fake', name: 'Submitted', command: 'submitted-command' }] })
    expect(manager.snapshot().presets[0].name).toBe('Newer')
    expect(JSON.parse(await readFile(join(root, 'user/agents.json'), 'utf8')).projects[root].presets[0].name).toBe('Newer')
    await manager.resetProjectOverrides(['agents.presets'])
    expect(manager.snapshot().presets[0].name).toBe('Submitted')
  })

  it('retires saved matching permission fields while preserving newer edits', async () => {
    const { root, manager } = await fakeManager('normal', false)
    await manager.ready
    await manager.configure({ ...manager.snapshot(), permissions: { fileEdits: 'allow-src', terminal: 'allow' } })
    await manager.configure({ ...manager.snapshot(), permissions: { fileEdits: 'never', terminal: 'allow' } })
    await manager.retireProjectOverrides(['agents.permissions'], { permissions: { terminal: 'allow', fileEdits: 'allow-src' } })
    expect(JSON.parse(await readFile(join(root, 'user/agents.json'), 'utf8')).projects[root].permissions).toEqual({ fileEdits: 'never' })
    await manager.close()
    const next = testAgentManager({ root, dataFile: join(root, 'user/agents.json'), config: { permissions: { fileEdits: 'ask', terminal: 'never' } } })
    await next.ready
    expect(next.snapshot().permissions).toEqual({ fileEdits: 'never', terminal: 'never' })
  })

  it('retires structurally equal preset values despite object property order', async () => {
    const { root, manager } = await fakeManager('normal', false)
    await manager.ready
    await manager.configure({ ...manager.snapshot(), presets: [{ id: 'fake', name: 'Local', command: 'local-command', default: true }] })
    await manager.retireProjectOverrides(['agents.presets'], { presets: [{ default: true, command: 'local-command', name: 'Local', id: 'fake' }] })
    expect(JSON.parse(await readFile(join(root, 'user/agents.json'), 'utf8')).projects[root].presets).toBeUndefined()
  })

  it('preserves ambiguous legacy custom commands and explicit policy until verified path retirement', async () => {
    const { root } = await configTestProject()
    const file = join(root, 'agents.json')
    const settings = { enabled: false, enabledIds: [], presets: [{ id: 'custom', name: 'Legacy', command: 'legacy-command' }], permissions: { fileEdits: 'never', terminal: 'ask' }, context: { exposeMcp: false, attachScreenshot: true, includeSource: true, askEachTime: true } }
    await writeFile(file, JSON.stringify({ version: 1, projects: { [root]: settings }, env: { custom: { TOKEN: 'legacy-private' } } }))
    const manager = testAgentManager({ root, dataFile: file, config: { presets: [{ id: 'project', name: 'Project', command: 'project-command' }], permissions: { fileEdits: 'allow-src', terminal: 'never' } } })
    await manager.ready
    expect(manager.snapshot()).toMatchObject(settings)
    await manager.resetProjectOverrides(['agents.presets'])
    expect(manager.snapshot()).toMatchObject({ presets: [{ id: 'project' }], permissions: settings.permissions, context: settings.context })
    expect(JSON.parse(await readFile(file, 'utf8')).env.custom.TOKEN).toBe('legacy-private')
  })
})
