import type { HistoireMiddlewareHandle } from 'histoire/node'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createHistoireProject } from 'histoire/node'
import { WebSocketServer } from 'ws'

/** Application entry owns signals and HTTP/WebSocket resources around library middleware. */
async function main() {
  const rootArgument = process.argv[2]
  if (!rootArgument) throw new Error('Usage: node dist/index.js /absolute/project/root [configFile]')
  const port = Number(process.env.PORT ?? 6007)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1..65535')
  const publicOrigin = process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`
  const project = await createHistoireProject({ root: resolve(rootArgument), configFile: process.argv[3] })
  let histoire: HistoireMiddlewareHandle | undefined
  let shuttingDown: Promise<void> | undefined
  const sockets = new WebSocketServer({ noServer: true })

  /** Caller-owned HTTP API remains available after Histoire is closed independently. */
  const server = createServer((request, response) => {
    if (request.url === '/api/health') {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ host: 'ready', histoire: project.getSnapshot().status }))
      return
    }
    if (request.url === '/api/histoire/close' && request.method === 'POST') {
      void project.close().then(() => response.end('closed')).catch((error) => {
        response.statusCode = 500
        response.end(error instanceof Error ? error.message : String(error))
      })
      return
    }
    histoire?.middleware(request, response, () => {
      response.statusCode = 404
      response.end('Not found')
    })
  })
  // Only /echo belongs to this host. Other upgrades remain available to Vite HMR.
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/echo') sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client))
  })
  sockets.on('connection', client => client.on('message', (bytes, binary) => client.send(bytes, { binary })))

  /** Signal cleanup is host application responsibility, separate from Histoire library. */
  function shutdown() {
    shuttingDown ??= (async () => {
      const results = await Promise.allSettled([
        project.close(),
        new Promise<void>((resolve, reject) => {
          for (const client of sockets.clients) client.terminate()
          sockets.close(error => error ? reject(error) : resolve())
        }),
        server.listening ? new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : Promise.resolve(),
      ])
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Host cleanup failed')
    })()
    void shuttingDown.catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
  }

  try {
    histoire = await project.createMiddleware({ httpServer: server, base: '/stories/', publicOrigin })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    await histoire.ready
    process.stdout.write(`Histoire: ${histoire.url}\nHost API: ${publicOrigin}/api/health\nHost WebSocket: ${publicOrigin.replace(/^http/, 'ws')}/echo\n`)
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  }
  catch (error) {
    shutdown()
    await shuttingDown
    throw error
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
