import { createServer, get } from 'node:http'
import { describe, expect, it } from 'vitest'
import { closeOwnedServer, listenOwnedServer } from '../../runtime/hosting/listener.js'
import { createEmbedHttpHost, openEmbedWebSocket } from '../utils/embed/http.js'

describe('owned HTTP listener teardown', () => {
  it('retains CLI collision fallback while strict SDK binding rejects occupied port', async () => {
    const first = createServer()
    const second = createServer()
    const strict = createServer()
    try {
      const occupied = new URL(await listenOwnedServer(first, 0, '127.0.0.1'))
      const port = Number(occupied.port)
      await expect(listenOwnedServer(strict, port, '127.0.0.1')).rejects.toMatchObject({ code: 'EADDRINUSE' })
      const available = new URL(await listenOwnedServer(second, port, '127.0.0.1', false))
      expect(Number(available.port)).toBeGreaterThan(port)
    }
    finally {
      await Promise.all([closeOwnedServer(first), closeOwnedServer(second), closeOwnedServer(strict)])
    }
  })

  it('closes an unfinished owned response instead of waiting forever for its caller', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200)
      response.write('unfinished')
    })
    const origin = await listenOwnedServer(server, 0, '127.0.0.1')
    const request = get(origin)
    request.on('error', () => {})
    await new Promise<void>(resolve => request.once('response', (response) => {
      response.on('error', () => {})
      response.once('data', () => resolve())
    }))
    await closeOwnedServer(server)
    expect(server.listening).toBe(false)
    request.destroy()
  })

  it('retires every socket of an owned listener, including unrelated upgraded sockets', async () => {
    const host = await createEmbedHttpHost()
    const origin = await listenOwnedServer(host.server, 0, '127.0.0.1')
    const socket = await openEmbedWebSocket(`${origin.replace('http:', 'ws:')}/host-ws`)
    const closed = new Promise<void>(resolve => socket.addEventListener('close', () => resolve(), { once: true }))
    try {
      await closeOwnedServer(host.server)
      await closed
      expect(host.server.listening).toBe(false)
    }
    finally {
      socket.close()
      await host.close()
    }
  })
})
