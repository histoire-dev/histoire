import { join } from 'pathe'
import { HistoireConfig } from '../config.js'
import { Context } from '../context.js'
import { createServer } from '../server.js'

export interface DevOptions {
  port: number
}

export async function devCommand (options: DevOptions) {
  const config: HistoireConfig = {
    sourceDir: join(process.cwd(), 'src'),
    outDir: join(process.cwd(), 'histoire-dist'),
    storyMatch: ['**/*.story.vue'],
  }
  const ctx: Context = {
    config,
    mode: 'dev',
  }
  const server = await createServer(ctx)
  await server.listen(options.port)
  server.printUrls()
}
