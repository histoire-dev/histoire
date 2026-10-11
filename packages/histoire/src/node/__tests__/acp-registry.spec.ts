import { readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { parseAgentRegistry, resolveAgentDistribution } from '../acp/registry-schema.js'
import { createAgentRegistry } from '../acp/registry.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

/** Remote catalog fixture varies distributions without mirroring parser behavior. */
function catalog() {
  return { agents: [
    { id: 'npm', name: 'Node agent', icon: 'https://cdn.agentclientprotocol.com/registry/v1/latest/npm.svg', distribution: { npx: { package: '@test/agent@1.2', args: ['--acp'], env: { FLAG: '1' } }, uvx: { package: 'ignored' } } },
    { id: 'python', name: 'Python agent', icon: 'javascript:alert(1)', distribution: { uvx: { package: 'agent==2', args: ['acp'] } } },
    { id: 'binary', name: 'Binary agent', distribution: { binary: { 'linux-x86_64': { archive: 'https://example.test/agent.zip', cmd: './bin/agent', args: ['acp'] } } } },
    { id: 'unsupported', name: 'Other platform', distribution: { binary: { 'darwin-aarch64': { archive: 'https://example.test/agent.zip', cmd: './agent' } } } },
    ...Array.from({ length: 40 }, (_, index) => ({ id: `extra-${index}`, name: `Extra ${index}`, distribution: { npx: { package: 'extra@1' } } })),
  ] }
}

describe('agent registry catalog', () => {
  it('lists every valid entry and resolves exact distribution arguments for current platform', () => {
    const entries = parseAgentRegistry(catalog())
    expect(entries).toHaveLength(44)
    expect(resolveAgentDistribution(entries[0], 'linux', 'x64')).toEqual({ kind: 'npx', command: 'npx', args: ['--yes', '@test/agent@1.2', '--acp'], env: { FLAG: '1' } })
    expect(resolveAgentDistribution(entries[1], 'linux', 'x64')).toEqual({ kind: 'uvx', command: 'uvx', args: ['agent==2', 'acp'], env: {} })
    expect(resolveAgentDistribution(entries[2], 'linux', 'x64')).toMatchObject({ kind: 'binary', command: './bin/agent', args: ['acp'], archive: 'https://example.test/agent.zip' })
    expect(resolveAgentDistribution(entries[3], 'linux', 'x64')).toBeUndefined()
  })

  it('uses fresh cache, refreshes explicitly, and preserves valid catalog through invalid and offline responses', async () => {
    const { root } = await configTestProject()
    let calls = 0
    let reply: unknown = catalog()
    const registry = createAgentRegistry({ cacheDir: root, platform: 'linux', arch: 'x64', fetch: async () => {
      calls++
      if (reply instanceof Error) throw reply
      return new Response(JSON.stringify(reply))
    } })
    const first = await registry.load()
    expect(first.entries).toHaveLength(44)
    expect(first.entries[0].icon).toBe('https://cdn.agentclientprotocol.com/registry/v1/latest/npm.svg')
    expect(first.entries[1].icon).toBeUndefined()
    expect(first.entries.find(entry => entry.id === 'unsupported')?.available).toBe(false)
    expect((await registry.load()).status.state).toBe('fresh')
    expect(calls).toBe(1)
    const cached = await readFile(join(root, 'acp-registry.json'), 'utf8')
    reply = { bad: 'document' }
    expect((await registry.load(true)).status.state).toBe('stale')
    expect(await readFile(join(root, 'acp-registry.json'), 'utf8')).toBe(cached)
    await utimes(join(root, 'acp-registry.json'), new Date(0), new Date(0))
    reply = new Error('offline')
    expect((await registry.load()).entries).toEqual(first.entries)
    const another = createAgentRegistry({ cacheDir: join(root, 'empty'), fetch: async () => {
      throw new Error('offline')
    } })
    expect(await another.load()).toMatchObject({ entries: [], status: { state: 'unavailable' } })
  })

  it('refreshes older normalized caches for icon metadata without losing offline catalog', async () => {
    const { root } = await configTestProject()
    await writeFile(join(root, 'acp-registry.json'), JSON.stringify({ agents: catalog().agents.map(entry => ({ ...entry, icon: undefined })) }))
    const offline = createAgentRegistry({ cacheDir: root, fetch: async () => {
      throw new Error('offline')
    } })
    expect(await offline.load()).toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ id: 'npm' })]), status: { state: 'stale' } })
    let calls = 0
    const online = createAgentRegistry({ cacheDir: root, fetch: async () => {
      calls++
      return new Response(JSON.stringify(catalog()))
    } })
    expect((await online.load()).entries[0].icon).toBe('https://cdn.agentclientprotocol.com/registry/v1/latest/npm.svg')
    await online.load()
    expect(calls).toBe(1)
  })
})
