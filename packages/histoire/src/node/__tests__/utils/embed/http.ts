import type { ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Connect } from 'vite'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as createHttpsServer, get as httpsGet } from 'node:https'

/** Real caller-owned HTTP/HTTPS API and unrelated WebSocket, without another WS package. */
export async function createEmbedHttpHost(https = false) {
  const middleware: Connect.NextHandleFunction[] = []
  const sockets = new Set<Duplex>()
  let streaming: ServerResponse | undefined
  const tls = https
    ? {
        key: await readFile(new URL('../../fixtures/embed/localhost-key.pem', import.meta.url)),
        cert: await readFile(new URL('../../fixtures/embed/localhost-cert.pem', import.meta.url)),
      }
    : undefined
  const server = tls ? createHttpsServer(tls) : createServer()
  server.on('request', (request, response) => {
    let index = 0
    const next = () => {
      const callback = middleware[index++]
      if (callback) {
        callback(request, response, next)
      }
      else {
        if (request.url === '/host-stream') {
          streaming = response
          response.writeHead(200)
          response.write('unfinished')
          return
        }
        response.statusCode = request.url === '/host-api' ? 200 : 404
        response.end(request.url === '/host-api' ? 'host survives' : 'missing')
      }
    }
    next()
  })
  const upgrade = (request, socket: Duplex) => {
    if (request.url !== '/host-ws') return
    const hash = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${hash}\r\n\r\n`)
    sockets.add(socket)
    socket.on('data', () => socket.write(Buffer.from([0x81, 4, 112, 111, 110, 103])))
    socket.once('close', () => {
      sockets.delete(socket)
    })
  }
  server.on('upgrade', upgrade)
  let origin = ''
  return {
    server,
    middleware,
    upgrade,
    /** Finishes caller work only when its caller explicitly requests it. */
    finishStream() {
      streaming?.end(' finished')
    },
    /** Actual bound caller origin, resolved only after caller listening. */
    get origin() {
      return origin
    },
    /** Explicit caller action; SDK must never invoke this method. */
    async listen() {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing host address')
      origin = `${https ? 'https' : 'http'}://127.0.0.1:${address.port}`
      return origin
    },
    /** Removes only this fixture's listener and sockets after SDK teardown. */
    async close() {
      streaming?.end()
      for (const socket of sockets) socket.destroy()
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    },
  }
}

/** Native real WebSocket client, including Vite's expected HMR protocol. */
export async function openEmbedWebSocket(url: string, protocol?: string) {
  const socket = new WebSocket(url, protocol)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  return socket
}

/** Sends one host message and waits for its real response. */
export async function pingEmbedWebSocket(socket: WebSocket): Promise<string> {
  const message = new Promise<string>(resolve => socket.addEventListener('message', event => resolve(String(event.data)), { once: true }))
  socket.send('ping')
  return message
}

/** Explicitly trusts only fixture self-signed HTTPS; no process TLS/environment mutation. */
export function readEmbedHttps(url: string): Promise<{ status: number, text: string }> {
  return new Promise((resolve, reject) => {
    httpsGet(url, { rejectUnauthorized: false }, (response) => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        text += chunk
      })
      response.on('end', () => resolve({ status: response.statusCode, text }))
    }).on('error', reject)
  })
}
