import type { UiAgentPermission } from '@histoire/shared'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { countChangedLines } from '../acp/file-changes.js'
import { createPermissionBroker } from '../acp/permissions.js'
import { buildPromptContext } from '../acp/prompt-context.js'
import { disposeAgentManagers, fakeAgentFile, fakeManager, testAgentManager } from './utils/acp.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(async () => {
  await disposeAgentManagers()
  await disposeConfigProjects()
})

describe('aCP agent manager', () => {
  it('requires global and agent opt-in, and starts lazily', async () => {
    const { manager } = await fakeManager('normal', false)
    expect(manager.snapshot().agents[0].state).toBe('disabled')
    await expect(manager.prompt({ threadId: 'one', text: 'Hello' })).rejects.toThrow('disabled')
    await manager.configure({ ...manager.snapshot(), enabled: true, enabledIds: [] })
    manager.snapshot().enabledIds.push('fake')
    await expect(manager.prompt({ threadId: 'one', text: 'Hello' })).rejects.toThrow('disabled')
    await manager.configure({ ...manager.snapshot(), enabledIds: ['fake'] })
    expect(manager.snapshot().agents[0].state).toBe('idle')
    expect(manager.snapshot().agents[0].logs).toEqual([])
  })

  it('handshakes, streams replies, reuses thread sessions, and isolates distinct threads', async () => {
    const { manager } = await fakeManager()
    const updates: string[] = []
    manager.onUpdate((event) => {
      if (event.type === 'reply') updates.push(event.value.text)
    })
    const first = await manager.prompt({ threadId: 'one', text: 'Hello' })
    expect(first.text).toContain('session-1')
    expect(updates.join('')).toBe(first.text)
    expect((await manager.prompt({ threadId: 'one', text: 'Follow-up' })).text).toContain('session-1')
    expect((await manager.prompt({ threadId: 'two', text: 'Separate' })).text).toContain('session-2')
    expect(manager.snapshot().agents[0].state).toBe('idle')
    await manager.close()
    await expect(manager.prompt({ threadId: 'one', text: 'Late' })).rejects.toThrow('closed')
  })

  it('mediates permission replies and cancels pending requests on shutdown', async () => {
    const { manager } = await fakeManager('permission')
    const permissions: UiAgentPermission[] = []
    manager.onUpdate((event) => {
      if (event.type === 'permission') permissions.push(event.value)
    })
    const prompt = manager.prompt({ threadId: 'one', text: 'Edit' })
    await expect.poll(() => permissions.length).toBe(1)
    manager.replyPermission(permissions[0].requestId, true, false)
    expect((await prompt).text).toBe('once')
    const pending = manager.prompt({ threadId: 'two', text: 'Edit' })
    const observed = pending.catch(error => error)
    await expect.poll(() => permissions.length).toBe(2)
    await manager.close()
    expect(await observed).toBeInstanceOf(Error)
  })

  it('redacts user env from stderr, error messages, snapshots, and streamed replies', async () => {
    const { manager, root } = await fakeManager()
    await manager.setEnvironment('fake', { AGENT_TOKEN: 'hidden-secret' })
    const events: unknown[] = []
    manager.onUpdate(event => events.push(event))
    const reply = await manager.prompt({ threadId: 'one', text: 'Hello' })
    expect(reply.text).not.toContain('hidden-secret')
    expect(JSON.stringify([events, manager.snapshot()])).not.toContain('hidden-secret')
    expect(manager.snapshot().agents[0].envKeys).toEqual(['AGENT_TOKEN'])
    expect(await import('node:fs/promises').then(fs => fs.readFile(join(root, 'user/agents.json'), 'utf8'))).toContain('hidden-secret')
  })

  it('redacts a credential split across consecutive reply chunks and retains other env keys', async () => {
    const { manager } = await fakeManager('split-secret')
    await manager.setEnvironment('fake', { FIRST: 'first-private', AGENT_TOKEN: 'split-private-token' })
    await manager.setEnvironment('fake', { SECOND: 'second-private' })
    const observed: unknown[] = []
    manager.onUpdate(event => observed.push(event))
    const reply = await manager.prompt({ threadId: 'one', text: 'Hello' })
    expect(reply.text).toBe('before [redacted] after')
    expect(JSON.stringify(observed)).not.toContain('split-private-token')
    expect(manager.snapshot().agents[0].envKeys).toEqual(['FIRST', 'AGENT_TOKEN', 'SECOND'])
  })

  it('redacts colliding credentials from every public agent projection', async () => {
    const { root } = await configTestProject()
    const manager = testAgentManager({
      root,
      dataFile: join(root, 'user/agents.json'),
      config: {
        enabled: true,
        presets: [
          { id: 'first', name: 'First', command: process.execPath, args: [fakeAgentFile, 'public-secrets'] },
          { id: 'second', name: 'Second', command: process.execPath, args: [fakeAgentFile, 'normal'], default: true },
        ],
      },
    })
    const firstSecret = 'FIRST-FAKE-CREDENTIAL'
    const secondSecret = 'SECOND-FAKE-CREDENTIAL'
    const events: unknown[] = []
    manager.onUpdate(event => events.push(event))
    await manager.setEnvironment('first', { AGENT_TOKEN: firstSecret })
    await manager.setEnvironment('second', { AGENT_TOKEN: secondSecret })

    const first = manager.prompt({ agentId: 'first', threadId: 'first', text: 'Need permission' })
    await expect.poll(() => events.find(event => (event as { type?: string }).type === 'permission')).toBeTruthy()
    const permission = events.find(event => (event as { type?: string }).type === 'permission') as { value: { requestId: string } }
    manager.replyPermission(permission.value.requestId, true, false)
    expect((await first).text).toBe('[redacted]')
    await expect.poll(() => manager.snapshot().agents.find(agent => agent.id === 'first')?.state).toBe('error')
    expect((await manager.prompt({ agentId: 'second', threadId: 'second', text: 'Reply' })).text).toContain('[redacted]')

    const publicValues = JSON.stringify([events, manager.snapshot()])
    expect(publicValues).not.toContain(firstSecret)
    expect(publicValues).not.toContain(secondSecret)
    expect(publicValues).toContain('[redacted]')
  })

  it('redacts a retired runtime credential during environment rotation', async () => {
    const { manager } = await fakeManager('rotation-secret')
    const oldSecret = 'OLD-FAKE-CREDENTIAL'
    const newSecret = 'NEW-FAKE-CREDENTIAL'
    await manager.setEnvironment('fake', { AGENT_TOKEN: oldSecret })
    await manager.prompt({ threadId: 'first', text: 'Start' })
    const events: unknown[] = []
    manager.onUpdate(event => events.push(event))

    await manager.setEnvironment('fake', { AGENT_TOKEN: newSecret })

    const publicValues = JSON.stringify([events, manager.snapshot()])
    expect(publicValues).not.toContain(oldSecret)
    expect(publicValues).not.toContain(newSecret)
    expect(publicValues).toContain('[redacted]')
  })

  it('keeps persistent permission scopes, rejects overlapping prompts and stops on config change', async () => {
    const { manager } = await fakeManager('permission')
    const questions: UiAgentPermission[] = []
    manager.onUpdate((event) => {
      if (event.type === 'permission') questions.push(event.value)
    })
    const first = manager.prompt({ threadId: 'one', text: 'Edit' })
    await expect.poll(() => questions.length).toBe(1)
    await expect(manager.prompt({ threadId: 'parallel', text: 'Overlap' })).rejects.toThrow('busy')
    manager.replyPermission(questions[0].requestId, true, true)
    expect((await first).text).toBe('once')
    expect((await manager.prompt({ threadId: 'one', text: 'Same session' })).text).toBe('once')
    expect(questions).toHaveLength(1)
    const pending = manager.prompt({ threadId: 'two', text: 'Distinct session' }).catch(error => error)
    await expect.poll(() => questions.length).toBe(2)
    await manager.configure({ ...manager.snapshot(), enabled: false })
    expect(await pending).toBeInstanceOf(Error)
    expect(manager.snapshot().agents[0].state).toBe('disabled')
  })

  it('retires idle subprocesses and reacquires fresh independent sessions', async () => {
    const { manager } = await fakeManager('normal', true, 300)
    expect((await manager.prompt({ threadId: 'one', text: 'Hello' })).text).toContain('session-1')
    await expect.poll(() => manager.snapshot().agents[0].logs).not.toEqual([])
    await expect.poll(() => manager.snapshot().agents[0].logs, { timeout: 3000 }).toEqual([])
    expect((await manager.prompt({ threadId: 'two', text: 'Fresh process' })).text).toContain('session-1')
  })

  it('projects completed tool diffs and ignores failed, pending, and outside changes', async () => {
    const { manager } = await fakeManager('diff')
    const result = await manager.prompt({ threadId: 'one', text: 'Edit' })
    expect(result.changes).toEqual([{ file: 'src/button.ts', added: 2, removed: 1 }])
    expect(countChangedLines('first\nold\nkeep\nlast\n', 'first\nnew\nkeep\nextra\nlast\n')).toEqual({ added: 2, removed: 1 })
  })

  it('applies current context switches before sending a real protocol prompt', async () => {
    const { manager } = await fakeManager('context')
    await manager.configure({ ...manager.snapshot(), context: { exposeMcp: false, attachScreenshot: false, includeSource: false, askEachTime: true } })
    const result = await manager.prompt({ threadId: 'one', text: 'Plain request', context: { storyId: 'button', props: { secretProp: 'omitted-prop' }, source: 'omitted-source.ts', screenshot: 'omitted-shot.png' } })
    expect(result.text).toContain('Plain request')
    expect(result.text).toContain('button')
    expect(result.text).not.toContain('omitted-')
  })

  it.each([['mismatch', 'protocol version'], ['crash', 'fixture crash']])('reports %s distinctly and cleans up its process', async (scenario, message) => {
    const { manager } = await fakeManager(scenario)
    await expect(manager.prompt({ threadId: 'one', text: 'Hello' })).rejects.toThrow(message)
    await expect.poll(() => manager.snapshot().agents[0].state).toBe('error')
    expect(manager.snapshot().agents[0].error).toContain(message)
  })

  it('reports unavailable command without executing a shell or installing software', async () => {
    const { manager } = await fakeManager()
    await manager.configure({ ...manager.snapshot(), presets: [{ id: 'missing', name: 'Missing', command: 'histoire-never-installed-agent' }], enabledIds: ['missing'] })
    await expect(manager.prompt({ threadId: 'one', text: 'Hello' })).rejects.toThrow('not installed')
    expect(manager.snapshot().agents[0].state).toBe('not-installed')
  })
})

describe('aCP permission policy and context', () => {
  it('auto-allows only real source paths and asks on symlink escapes', async () => {
    const { root } = await configTestProject()
    const outside = await configTestProject()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src/file.ts'), '')
    await symlink(outside.root, join(root, 'src/link'))
    const questions: UiAgentPermission[] = []
    const broker = createPermissionBroker({ root, policy: () => ({ fileEdits: 'allow-src', terminal: 'never' }), emit: item => questions.push(item), sanitize: value => value })
    /** Creates a protocol tool request with declared locations. */
    function request(file: string, kind = 'edit') {
      return { sessionId: 'one', toolCall: { toolCallId: file, kind: kind as 'edit', locations: [{ path: file }] }, options: [{ optionId: 'once', name: 'Allow', kind: 'allow_once' as const }] }
    }
    expect((await broker.request('fake', request(join(root, 'src/file.ts')))).outcome).toEqual({ outcome: 'selected', optionId: 'once' })
    const asked = broker.request('fake', request(join(root, 'src/link/file.ts')))
    await expect.poll(() => questions.length).toBe(1)
    broker.reply(questions[0].requestId, false, false)
    expect((await asked).outcome.outcome).toBe('cancelled')
    expect((await broker.request('fake', request('echo test', 'execute'))).outcome.outcome).toBe('cancelled')
    broker.close()
  })

  it('includes only enabled MCP/source/screenshot context fields', () => {
    const context = { storyId: 'button', variantId: 'primary', props: { label: 'Save' }, selector: '#button', screenshot: '.histoire/screenshots/button.png', source: 'Button.vue' }
    const full = buildPromptContext(context, { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false }, 'http://localhost:6006/mcp')
    expect(full).toContain('http://localhost:6006/mcp')
    expect(full).toContain('primary')
    expect(full).toContain('Save')
    expect(full).toContain('#button')
    expect(full).toContain('button.png')
    const limited = buildPromptContext(context, { exposeMcp: false, attachScreenshot: false, includeSource: false, askEachTime: false }, 'http://localhost:6006/mcp')
    expect(limited).not.toContain('localhost')
    expect(limited).not.toContain('button.png')
    expect(limited).not.toContain('Save')
  })
})
