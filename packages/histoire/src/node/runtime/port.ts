import { createServer } from 'node:net'

/**
 * Resolves zero to an available loopback port because Vite ignores listen(0).
 * Reservation is released before Vite binds. Vite retains its configured
 * strictPort/fallback policy if another listener wins that short race; callers
 * must read the actual bound address rather than treating this port as final.
 */
export async function resolveDevServerPort(port?: number): Promise<number | undefined> {
  if (port !== 0) return port
  const reservation = createServer()
  try {
    const selected = await new Promise<number>((resolve, reject) => {
      reservation.once('error', reject)
      reservation.listen(0, '127.0.0.1', () => {
        const address = reservation.address()
        if (address && typeof address !== 'string') resolve(address.port)
        else reject(new Error('Unable to reserve ephemeral dev port'))
      })
    })
    return selected
  }
  finally {
    if (reservation.listening) {
      await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()))
    }
  }
}
