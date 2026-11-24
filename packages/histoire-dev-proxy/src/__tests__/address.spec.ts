import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { startDevProxy } from '../../dist/index.js'

/** Port free at the time of the call. */
async function freePort() {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

/** Project whose runtime reports `address` as its configured public address. */
async function project(address: { port?: number, host?: string | boolean }) {
  const root = await mkdtemp(join(tmpdir(), 'histoire-proxy-address-'))
  await writeFile(join(root, 'histoire.config.ts'), JSON.stringify({ address }))
  return root
}

it('moves the public listener to the configured address', async () => {
  const port = await freePort()
  const root = await project({ port, host: '127.0.0.1' })
  const listening: string[] = []
  const proxy = await startDevProxy({ root, runtime: new URL('./fixtures/runtime.mjs', import.meta.url), onListening: url => listening.push(url) })
  try {
    await proxy.ready
    expect(proxy.url).toBe(`http://127.0.0.1:${port}/`)
    expect(listening).toEqual([listening[0], proxy.url])
    expect((await (await fetch(proxy.url)).json()).origin).toBe(new URL(proxy.url).origin)
    await expect(fetch(listening[0])).rejects.toThrow()
  }
  finally {
    await proxy.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('keeps the address given on the command line', async () => {
  const root = await project({ port: await freePort(), host: 'localhost' })
  const listening: string[] = []
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url), onListening: url => listening.push(url) })
  try {
    await proxy.ready
    expect(listening).toEqual([proxy.url])
    expect((await (await fetch(proxy.url)).json()).origin).toBe(new URL(proxy.url).origin)
  }
  finally {
    await proxy.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('allows command-line values to override invalid configured address values', async () => {
  const root = await project({ port: 65536, host: '' })
  const proxy = await startDevProxy({ root, port: 0, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url) })
  try {
    const initialUrl = proxy.url
    await expect.poll(() => proxy.status).toBe('ready')
    expect(proxy.url).toBe(initialUrl)
    expect((await (await fetch(initialUrl)).json()).origin).toBe(new URL(initialUrl).origin)
  }
  finally {
    await proxy.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('reports invalid effective settings and starts after the configuration is corrected', async () => {
  const root = await project({ port: 65536 })
  const proxy = await startDevProxy({ root, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url) })
  try {
    const initialUrl = proxy.url
    await expect.poll(() => proxy.status).toBe('failed')
    await expect(proxy.ready).rejects.toThrow('Port must be an integer from 0 to 65535')
    expect(proxy.url).toBe(initialUrl)
    await writeFile(join(root, 'histoire.config.ts'), JSON.stringify({ address: { port: 0 } }))
    await expect.poll(() => proxy.status).toBe('ready')
    expect((await (await fetch(proxy.url)).json()).origin).toBe(new URL(proxy.url).origin)
  }
  finally {
    await proxy.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('follows a configuration edit that changes the address', async () => {
  const first = await freePort()
  const root = await project({ port: first })
  const proxy = await startDevProxy({ root, host: '127.0.0.1', runtime: new URL('./fixtures/runtime.mjs', import.meta.url) })
  try {
    await proxy.ready
    expect(new URL(proxy.url).port).toBe(String(first))
    const second = await freePort()
    await writeFile(join(root, 'histoire.config.ts'), JSON.stringify({ address: { port: second } }))
    await expect.poll(() => new URL(proxy.url).port, { timeout: 5000 }).toBe(String(second))
    await expect.poll(async () => (await fetch(proxy.url)).status, { timeout: 5000 }).toBe(200)
  }
  finally {
    await proxy.close()
    await rm(root, { recursive: true, force: true })
  }
})
