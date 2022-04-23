import http from 'http'
import { resolveConfig as resolveViteConfig } from 'vite'
import connect from 'connect'
import sirv from 'sirv'
import pc from 'picocolors'
import { createContext } from '../context.js'
import { createVitePlugins } from '../vite.js'

export interface PreviewOptions {
  port?: number
}

export async function previewCommand (options: PreviewOptions) {
  const ctx = await createContext({
    mode: 'build',
  })
  const viteConfig = await resolveViteConfig({
    plugins: await createVitePlugins(ctx),
  }, 'build')

  const app = connect()

  app.use(
    viteConfig.base,
    sirv(ctx.config.outDir, {
      dev: true,
      etag: true,
      single: true,
    }),
  )

  let port = options.port ?? 3000

  const httpServer = http.createServer(app)

  function onError (e: Error & { code?: string }) {
    if (e.code === 'EADDRINUSE') {
      httpServer.listen(++port)
    } else {
      throw e
    }
  }

  httpServer.on('error', onError)

  httpServer.listen(port, () => {
    httpServer.off('error', onError)
    console.log(`Preview server listening on ${pc.cyan(`http://localhost:${port}${viteConfig.base}`)}`)
  })
}
