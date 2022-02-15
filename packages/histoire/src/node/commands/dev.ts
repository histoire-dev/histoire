import { resolveConfig } from '../config.js'
import { Context } from '../context.js'
import { createServer } from '../server.js'

export interface DevOptions {
  port: number
}

export async function devCommand (options: DevOptions) {
  const config = await resolveConfig()
  const ctx: Context = {
    config,
    mode: 'dev',
    storyFiles: [],
  }
  const { server } = await createServer(ctx, options.port)
  server.printUrls()
}
