import { createHash } from 'node:crypto'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentBinaryCache } from '../acp/binary-cache.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

/** Frozen archive data contains one executable plus contained or escaping links. */
function archive(name: string) {
  return readFile(fileURLToPath(new URL(`./fixtures/acp/archives/${name}`, import.meta.url)))
}

describe('managed agent binary cache', () => {
  it.each(['tgz', 'zip'])('publishes %s atomically, preserves contained links and reuses content-addressed install', async (extension) => {
    const { root } = await configTestProject()
    const bytes = await archive(`safe.${extension}`)
    let downloads = 0
    const cache = createAgentBinaryCache(root, async () => {
      downloads++
      return bytes
    })
    const distribution = { kind: 'binary' as const, command: './agent', args: ['acp'], env: {}, archive: `https://example.test/agent.${extension}`, sha256: createHash('sha256').update(bytes).digest('hex') }
    const signal = new AbortController().signal
    const [first, second] = await Promise.all([cache.prepare('test', distribution, signal), cache.prepare('test', distribution, signal)])
    expect(first).toBe(second)
    expect(await readFile(first, 'utf8')).toBe('#!/bin/sh\necho agent\n')
    expect(await realpath(first)).toContain('/bin/agent')
    if (process.platform !== 'win32') expect((await stat(first)).mode & 0o111).toBe(0o111)
    expect(await cache.prepare('test', distribution, signal)).toBe(first)
    expect(downloads).toBe(1)
  })

  it.each(['unsafe-link.tgz', 'unsafe-path.tgz', 'unsafe-link.zip', 'unsafe-path.zip'])('rejects %s and leaves no install', async (name) => {
    const { root } = await configTestProject()
    const cache = createAgentBinaryCache(root, () => archive(name))
    await expect(cache.prepare('test', { kind: 'binary', command: './agent', args: [], env: {}, archive: `https://example.test/${name}` }, new AbortController().signal)).rejects.toThrow()
    expect(await readdir(join(root, 'acp-binaries/test'))).toEqual([])
  })

  it('rejects checksum mismatch, missing executable and aborted download without publishing', async () => {
    const { root } = await configTestProject()
    const cache = createAgentBinaryCache(root, () => archive('safe.tgz'))
    const distribution = { kind: 'binary' as const, command: './agent', args: [], env: {}, archive: 'https://example.test/agent.tgz' }
    await expect(cache.prepare('test', { ...distribution, sha256: '0'.repeat(64) }, new AbortController().signal)).rejects.toThrow('checksum')
    await expect(cache.prepare('test', { ...distribution, command: './missing' }, new AbortController().signal)).rejects.toThrow()
    const controller = new AbortController()
    controller.abort(new Error('retired'))
    await expect(cache.prepare('test', distribution, controller.signal)).rejects.toThrow('retired')
    expect(await readdir(join(root, 'acp-binaries/test'))).toEqual([])
  })
})
