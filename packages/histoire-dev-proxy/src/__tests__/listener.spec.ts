import { createServer } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { listen } from '../server/listener.js'

const servers = new Set<ReturnType<typeof createServer>>()

/** Tracks a server so every bind is released after its test. */
function server() {
  const value = createServer()
  servers.add(value)
  return value
}

afterEach(async () => {
  await Promise.all([...servers].map(value => new Promise(resolve => value.close(resolve))))
  servers.clear()
})

it('keeps the default host name in the public origin, whichever loopback family it binds', async () => {
  const url = new URL(await listen(server(), 0))
  expect(url.hostname).toBe('localhost')
  // The origin survives Vite's `encodeURI` of `server.origin`-prefixed asset URLs.
  expect(encodeURI(url.origin)).toBe(url.origin)
})

it('keeps an explicit host name', async () => {
  expect(new URL(await listen(server(), 0, 'localhost')).hostname).toBe('localhost')
})

it('reports the bound address for an explicit IP', async () => {
  expect(new URL(await listen(server(), 0, '127.0.0.1')).hostname).toBe('127.0.0.1')
})

it('reports localhost for a wildcard bind', async () => {
  expect(new URL(await listen(server(), 0, true)).hostname).toBe('localhost')
})
