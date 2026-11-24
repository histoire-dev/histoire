import type { Server } from 'node:http'
import { isIP } from 'node:net'

/** Check the effective port before opening or moving a listener. */
export function assertValidPort(port: unknown): asserts port is number {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535')
}

/** Host handed to `server.listen`; undefined binds every interface. */
function getBindHost(host: string | boolean) {
  if (typeof host === 'string') return host
  return host ? undefined : 'localhost'
}

/** Host shown in the public origin; a name is kept so `localhost` never becomes `[::1]`, which Vite mangles in asset URLs. */
function getPublicHost(bindHost: string | undefined, address: string) {
  if (bindHost && !isIP(bindHost)) return bindHost
  if (['::', '0.0.0.0'].includes(address)) return 'localhost'
  return address.includes(':') ? `[${address}]` : address
}

/** Binds public address before any project modules load, retaining occupied-port fallback. */
export async function listen(server: Server, port: number, host: string | boolean = 'localhost'): Promise<string> {
  assertValidPort(port)
  const bindHost = getBindHost(host)
  for (;;) {
    try {
      await new Promise<void>((resolve, reject) => {
        /** Rejects this bind attempt and drops its success listener. */
        function failed(error: Error) {
          server.off('listening', ready)
          reject(error)
        }
        /** Resolves this bind attempt and drops its failure listener. */
        function ready() {
          server.off('error', failed)
          resolve()
        }
        server.once('error', failed).once('listening', ready)
        server.listen(port, bindHost)
      })
      break
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || port === 0 || port >= 65535) throw error
      port++
    }
  }
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Unable to resolve Histoire proxy address')
  return `http://${getPublicHost(bindHost, address.address)}:${address.port}`
}
