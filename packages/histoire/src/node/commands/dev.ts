import { createContext } from '../context.js'
import { createServer } from '../server.js'

export interface DevOptions {
  port: number
}

export async function devCommand (options: DevOptions) {
  const ctx = await createContext({
    mode: 'dev',
  })
  const { server } = await createServer(ctx, options.port)
  server.printUrls()
}
