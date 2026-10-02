import type { Server } from 'node:http'

/** Close idle sockets immediately and bound remaining owned connections. */
export function closeNodeListener(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => server.closeAllConnections(), 1000)
    server.close((error) => {
      clearTimeout(timer)
      if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error)
      else resolve()
    })
    server.closeIdleConnections()
  })
}
