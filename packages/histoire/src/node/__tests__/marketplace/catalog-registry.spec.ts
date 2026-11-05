import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { clearRegistryMemory, createRegistryCache } from '../../marketplace/catalog/cache.js'
import { createRegistryClient } from '../../marketplace/catalog/registry.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'

afterEach(disposeConfigProjects)

describe('registry response boundaries', () => {
  it.each([
    { name: 'different', latest: '1.0.0' },
    { name: 'audit', latest: 'missing' },
  ])('rejects cached identity/latest mismatch without fetching: $name / $latest', async ({ name, latest }) => {
    const registry = await registryServer({ packages: { audit: { 'name': 'audit', 'dist-tags': { latest: '1.0.0' }, 'versions': { '1.0.0': {} } } } })
    onTestFinished(registry.close)
    const { root } = await configTestProject()
    const key = `${registry.url}/audit`
    // Persist external malformed metadata, then cross a generation boundary so disk is untrusted.
    await createRegistryCache(root).get(key, value => value, async () => ({ 'name': name, 'dist-tags': { latest }, 'versions': { '1.0.0': {} } }))
    clearRegistryMemory(root)
    onTestFinished(() => clearRegistryMemory(root))
    const client = createRegistryClient(root, { registryUrl: registry.url })
    expect(await client.cachedPackument('audit')).toBeUndefined()
    expect(registry.requests).toEqual([])
    expect((await client.packument('audit')).value.name).toBe('audit')
    expect(registry.requests.map(url => url.pathname)).toEqual(['/audit'])
  })

  it('keeps request timeout even when caller supplies its own cancellation signal', async () => {
    const registry = await registryServer({ delayMs: 100 })
    onTestFinished(registry.close)
    const { root } = await configTestProject()
    const client = createRegistryClient(root, { registryUrl: registry.url, timeoutMs: 20 })
    await expect(client.packument('audit', new AbortController().signal)).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it.each([
    ['malformed JSON', '{'],
    ['invalid search schema', JSON.stringify({ objects: [], total: '1' })],
    ['oversized chunked search body', JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024) })],
  ])('rejects %s and leaves request retryable', async (_name, body) => {
    const registry = await registryServer({ body })
    onTestFinished(registry.close)
    const { root } = await configTestProject()
    const client = createRegistryClient(root, { registryUrl: registry.url })
    await expect(client.catalog()).rejects.toThrow()
    delete registry.options.body
    expect(await client.catalog()).toEqual({ packuments: [], stale: false })
    expect(registry.requests).toHaveLength(2)
  })

  it('rejects oversized packuments, identity mismatches, and unsafe package paths', async () => {
    const registry = await registryServer({ body: JSON.stringify({ padding: 'x'.repeat(8 * 1024 * 1024) }) })
    onTestFinished(registry.close)
    const { root } = await configTestProject()
    const client = createRegistryClient(root, { registryUrl: registry.url })
    await expect(client.packument('audit')).rejects.toThrow('Registry response too large')
    registry.options.body = JSON.stringify({ 'name': 'different', 'dist-tags': { latest: '1.0.0' }, 'versions': { '1.0.0': {} } })
    await expect(client.packument('audit')).rejects.toThrow('Invalid registry identity or latest version')
    expect(() => client.packument('../secret')).toThrow()
    expect(registry.requests).toHaveLength(2)
  })
})
