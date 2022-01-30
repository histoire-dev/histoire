import { join } from 'pathe'
import { HistoireConfig } from '../config.js'
import { Context } from '../context.js'
import { createServer } from '../server.js'

export interface DevOptions {
  port: number
}

export async function dev (options: DevOptions) {
  const config: HistoireConfig = {
    sourceDir: join(process.cwd(), 'src'),
    storyMatch: ['**/*.story.vue'],
  }
  const ctx: Context = {
    config,
  }
  const server = await createServer(ctx)
  await server.listen(options.port)
  server.printUrls()
}
