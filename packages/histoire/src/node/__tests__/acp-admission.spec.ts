import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { disposeAgentManagers, fakeManager } from './utils/acp.js'
import { disposeConfigProjects } from './utils/config-codemod.js'

afterEach(async () => {
  await disposeAgentManagers()
  await disposeConfigProjects()
})

describe('aCP configuration admission', () => {
  it('retires admission immediately, including prompts before persistence or delayed exit', async () => {
    const { root, manager } = await fakeManager('delayed-stop')
    await manager.prompt({ threadId: 'first', text: 'Start' })
    const configuring = manager.configure({ ...manager.snapshot(), enabled: false })
    const concurrent = manager.prompt({ threadId: 'replacement', text: 'During disable' }).catch(error => error)
    expect(await concurrent).toBeInstanceOf(Error)
    await configuring
    expect(manager.snapshot().enabled).toBe(false)
    expect((await readFile(join(root, 'launches.txt'), 'utf8')).trim().split('\n')).toHaveLength(1)
  })

  it('reacquires working reply authority after failed settings persistence', async () => {
    const { root, manager } = await fakeManager()
    await manager.prompt({ threadId: 'first', text: 'Start' })
    const file = join(root, 'user/agents.json')
    await manager.configure({ ...manager.snapshot(), context: { ...manager.snapshot().context, askEachTime: true } })
    const original = await readFile(file, 'utf8')
    await manager.prompt({ threadId: 'second', text: 'Before failure' })
    await writeFile(file, '{corrupt')
    await expect(manager.configure({ ...manager.snapshot(), enabled: false })).rejects.toThrow()
    await writeFile(file, original)
    const chunks: string[] = []
    const result = await manager.prompt({ threadId: 'after-failure', text: 'Continue', onUpdate: text => chunks.push(text) })
    expect(result.text).toContain('Hello')
    expect(chunks.join('')).toBe(result.text)
  })

  it('serializes concurrent preference transitions and does not restart after close', async () => {
    const { manager } = await fakeManager('delayed-stop')
    await manager.prompt({ threadId: 'first', text: 'Start' })
    const value = manager.snapshot()
    const first = manager.configure({ ...value, enabled: false })
    const second = manager.configure({ ...value, context: { ...value.context, askEachTime: true } })
    await Promise.all([first, second])
    expect(manager.snapshot()).toMatchObject({ enabled: true, context: { askEachTime: true } })
    const restart = manager.restart('fake').catch(error => error)
    const close = manager.close()
    await restart
    await close
    await expect(manager.prompt({ threadId: 'late', text: 'After close' })).rejects.toThrow('closed')
  })
})
