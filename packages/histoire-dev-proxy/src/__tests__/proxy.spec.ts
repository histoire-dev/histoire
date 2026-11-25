import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { startDevProxy } from '../../dist/index.js'

// Boundary: real public proxy, watcher and owned process. Fixture is an external
// HTTP/IPC runtime peer. CLI integration separately executes Histoire itself.
// Defects: waiting for runtime before listen; publishing stale child; replacing
// before cleanup. Oracles: HTTP while gate held, changed PID/body, released port.
it('serves HTTP before runtime readiness, replaces process after cleanup, and recovers config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'histoire-proxy-'))
  let release!: () => void
  const gate = createServer((_request, response) => {
    release = () => response.end('go')
  })
  await new Promise<void>((resolve, reject) => {
    gate.once('error', reject)
    gate.listen(0, '127.0.0.1', resolve)
  })
  const address = gate.address() as { port: number }
  const file = join(root, 'histoire.config.ts')
  await writeFile(file, JSON.stringify({ gate: `http://127.0.0.1:${address.port}`, value: 'first' }))
  const statuses: string[] = []
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), onStatus: state => statuses.push(state.status) })
  try {
    const response = await fetch(`${proxy.url}deep?story=book`, { headers: { accept: 'text/html' } })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Starting')
    expect((await fetch(`${proxy.url}module.js`)).status).toBe(503)
    expect((await fetch(`${proxy.url}api/data`)).status).toBe(503)
    const head = await fetch(proxy.url, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect(await (await fetch(`${proxy.url}__histoire/dev/lifecycle.js`)).text()).toContain('EventSource')
    await expect.poll(() => typeof release).toBe('function')
    release()
    await proxy.ready
    const first = await (await fetch(proxy.url)).json()
    expect(first.value).toBe('first')
    const upload = 'streamed body'.repeat(32_000)
    expect(await (await fetch(`${proxy.url}echo`, { method: 'POST', body: upload })).text()).toBe(upload)
    const abort = new AbortController()
    const streaming = await fetch(`${proxy.url}stream`, { signal: abort.signal })
    const reader = streaming.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('first chunk')
    abort.abort()
    await expect.poll(() => readFile(join(root, 'stream-closed'), 'utf8')).toBe('closed')
    await writeFile(file, JSON.stringify({ value: 'second' }))
    await expect.poll(async () => (await fetch(proxy.url)).text()).toContain('second')
    const second = await (await fetch(proxy.url)).json()
    expect(second.pid).not.toBe(first.pid)
    expect(() => process.kill(first.pid, 0)).toThrow()
    await writeFile(file, 'invalid config')
    await expect.poll(() => proxy.status).toBe('failed')
    expect(await (await fetch(proxy.url, { headers: { accept: 'text/html' } })).text()).toContain('Failed to start')
    // Failure screen's restart action: own origin only, then a fresh attempt begins.
    const restartUrl = `${proxy.url}__histoire/dev/restart`
    expect((await fetch(restartUrl, { method: 'POST', headers: { origin: 'http://evil.example' } })).status).toBe(403)
    const before = statuses.length
    expect((await fetch(restartUrl, { method: 'POST', headers: { origin: new URL(proxy.url).origin } })).status).toBe(202)
    await expect.poll(() => statuses.slice(before)).toContain('restarting')
    await expect.poll(() => proxy.status).toBe('failed')
    await writeFile(file, JSON.stringify({ value: 'recovered' }))
    await expect.poll(async () => (await fetch(proxy.url)).text()).toContain('recovered')
  }
  finally {
    release?.()
    await proxy.close()
    await new Promise<void>(resolve => gate.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(new URL(proxy.url).port), '127.0.0.1', resolve)
  })
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 20_000)

it('interrupts blocked acquisition and kills stuck owned descendants before replacing runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'histoire-proxy-winddown-'))
  let entered = false
  const gate = createServer(() => {
    entered = true
  })
  await new Promise<void>((resolve, reject) => {
    gate.once('error', reject)
    gate.listen(0, '127.0.0.1', resolve)
  })
  const file = join(root, 'histoire.config.ts')
  await writeFile(file, JSON.stringify({ gate: `http://127.0.0.1:${(gate.address() as { port: number }).port}` }))
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), shutdownTimeout: 150 })
  try {
    await expect.poll(() => entered).toBe(true)
    await writeFile(file, JSON.stringify({ value: 'hung', hang: true, descendant: true }))
    await proxy.ready
    const previous = await (await fetch(proxy.url)).json()
    expect(await (await fetch(previous.descendant)).text()).toBe('alive')
    await writeFile(file, JSON.stringify({ value: 'replacement' }))
    await expect.poll(async () => (await fetch(proxy.url)).text(), { timeout: 5000 }).toContain('replacement')
    expect(() => process.kill(previous.pid, 0)).toThrow()
    await expect(fetch(previous.descendant)).rejects.toThrow()
  }
  finally {
    await proxy.close()
    gate.closeAllConnections()
    await new Promise<void>(resolve => gate.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)

it('coalesces edits across successive blocked startup generations and publishes only latest config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'histoire-proxy-edits-'))
  const entered = new Set<string>()
  const gate = createServer((request) => {
    entered.add(request.url!)
  })
  await new Promise<void>((resolve, reject) => {
    gate.once('error', reject)
    gate.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${(gate.address() as { port: number }).port}`
  const file = join(root, 'histoire.config.ts')
  await writeFile(file, JSON.stringify({ gate: `${origin}/first` }))
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), shutdownTimeout: 150 })
  try {
    await expect.poll(() => entered.has('/first')).toBe(true)
    await writeFile(file, JSON.stringify({ gate: `${origin}/second` }))
    await expect.poll(() => entered.has('/second')).toBe(true)
    await writeFile(file, JSON.stringify({ value: 'latest config' }))
    await expect.poll(() => proxy.status, { timeout: 5000, message: 'Latest config should replace the blocked runtime' }).toBe('ready')
    await proxy.ready
    expect((await (await fetch(proxy.url)).json()).value).toBe('latest config')
  }
  finally {
    await proxy.close()
    gate.closeAllConnections()
    await new Promise<void>(resolve => gate.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 10_000)
