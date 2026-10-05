import { mkdir, symlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claimOutput } from '../../api/output-ownership.js'
import { createMcpOperations } from '../../mcp/operations/store.js'
import { createExecutionOwner } from '../../runtime/execution-owner.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { reserveHostBase } from '../../runtime/hosting/mounts.js'
import { matchesHostingBase, normalizeHostingOrigin } from '../../runtime/hosting/routes.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

describe('node hosting ownership', () => {
  it('claims exact normalized bases while preserving adjacent host routes', () => {
    const server = createServer()
    const release = reserveHostBase(server, '/one/')
    expect(() => reserveHostBase(server, '/one/')).toThrow('already mounted')
    expect(() => reserveHostBase(server, '/one/nested/')).toThrow('overlaps')
    expect(() => reserveHostBase(server, '/')).toThrow('overlaps')
    const other = reserveHostBase(server, '/one-other/')
    expect(matchesHostingBase('/one/path?value=original', '/one/')).toBe(true)
    expect(matchesHostingBase('/one?value=original', '/one/')).toBe(true)
    expect(matchesHostingBase('/one-other/', '/one/')).toBe(false)
    release()
    const again = reserveHostBase(server, '/one/')
    again()
    other()
  })

  it('requires an explicit HTTP(S) origin without credentials, query or path', () => {
    expect(normalizeHostingOrigin('https://localhost:7443/')).toBe('https://localhost:7443')
    for (const origin of ['file:///tmp/book', 'https://user@host', 'https://host/path', 'https://host/?token=secret', 'https://host/#fragment']) {
      expect(() => normalizeHostingOrigin(origin)).toThrow('publicOrigin')
    }
  })

  it('protects preview output across aliases and overlapping destructive build roots', async () => {
    const fixture = await createMcpProjectFixture()
    let release: (() => void) | undefined
    try {
      const output = join(fixture.root, 'output')
      await mkdir(output)
      await symlink(output, join(fixture.root, 'alias'))
      release = await claimOutput(output, 'preview')
      await expect(claimOutput(join(fixture.root, 'alias'), 'build')).rejects.toThrow('active preview')
      await expect(claimOutput(fixture.root, 'build')).rejects.toThrow('active preview')
      await expect(claimOutput(join(output, 'nested'), 'build')).rejects.toThrow('active preview')
      const distinct = await claimOutput(join(fixture.root, 'distinct'), 'build')
      distinct()
      release()
      release = await claimOutput(output, 'build')
      await expect(claimOutput(output, 'build')).rejects.toThrow('build already owns')
    }
    finally {
      release?.()
      await fixture.close()
    }
  })

  it('closing an adapter preserves an active unrelated capture and injected lane', async () => {
    const execution = createExecutionService()
    const result = deferred<string>()
    let captureSignal: AbortSignal | undefined
    const capture = execution.enqueue({ run: (signal) => {
      captureSignal = signal
      signal.addEventListener('abort', () => result.reject(new Error('Capture cancelled')), { once: true })
      return result.promise
    } })
    await flushMicrotasks()
    const operations = createMcpOperations({ execution, ownsExecution: false, capture: () => {
      throw new Error('Unused capture')
    } })
    try {
      await operations.invalidate()
      await operations.close()
      expect(captureSignal?.aborted).toBe(false)
      result.resolve('static capture')
      await expect(capture.result).resolves.toBe('static capture')
      await expect(execution.enqueue({ run: () => 'preview remains usable' }).result).resolves.toBe('preview remains usable')
      const owned = createMcpOperations({ execution, capture: () => {
        throw new Error('Unused capture')
      } })
      await owned.close()
      expect(execution.available).toBe(false)
    }
    finally {
      result.resolve('released')
      await execution.close()
    }
  })

  it('a dev owner drain leaves active preview work and other owners untouched', async () => {
    const execution = createExecutionService()
    const dev = createExecutionOwner(execution)
    const preview = createExecutionOwner(execution)
    const result = deferred<string>()
    let signal: AbortSignal | undefined
    const active = preview.enqueue({ run: (value) => {
      signal = value
      return result.promise
    } })
    await flushMicrotasks()
    const queued = dev.enqueue({ run: () => 'stale dev' })
    await dev.cancelAll()
    await expect(queued.result).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(signal?.aborted).toBe(false)
    result.resolve('preview')
    await expect(active.result).resolves.toBe('preview')
    await dev.close()
    await expect(preview.enqueue({ run: () => 'next preview' }).result).resolves.toBe('next preview')
    await preview.close()
    await execution.close()
  })

  it('quarantines the actual lane when scoped runner ignores abort and observes late settlement', async () => {
    const execution = createExecutionService()
    const owner = createExecutionOwner(execution, 5)
    const late = deferred<string>()
    const active = owner.enqueue({ run: () => late.promise })
    await flushMicrotasks()
    const queued = execution.enqueue({ run: () => 'must not start' })
    await expect(owner.cancelAll()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    await expect(queued.result).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(execution.available).toBe(false)
    late.resolve('late')
    await expect(active.result).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(() => execution.enqueue({ run: () => 'unsafe retry' })).toThrow('unavailable')
    await expect(execution.close()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
  })
})
