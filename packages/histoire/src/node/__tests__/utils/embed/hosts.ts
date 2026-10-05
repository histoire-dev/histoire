import { createServer } from 'node:http'
import { join } from 'node:path'
import connect from 'connect'
import { build } from 'esbuild'
import { closeOwnedServer, listenOwnedServer } from '../../../runtime/hosting/listener.js'
import { MCP_REPOSITORY_ROOT } from '../mcp/cli-project.js'

/** Locally packed browser SDK and unrelated host origins shared by runtime/framework gates. */
export async function createEmbedHosts(options: {
  /** Installed consumer entry when proving published package graph. */
  sdkEntry?: string
  /** Optional native consumer document. */
  html?: string
  /** Finite in-memory assets, with no filesystem route or CORS proxy. */
  modules?: Record<string, { body: string, contentType?: string }>
} = {}) {
  const bundle = await build({ entryPoints: [options.sdkEntry ?? join(MCP_REPOSITORY_ROOT, 'packages/histoire-sdk/dist/index.js')], bundle: true, format: 'esm', platform: 'browser', write: false, metafile: true })
  const sdk = bundle.outputFiles[0].text
  /** Host exposes only explicit SDK and fixture document routes. */
  function application() {
    const app = connect()
    for (const [path, asset] of Object.entries(options.modules ?? {})) {
      if (!/^\/[\w/-]+\.(?:js|css)$/.test(path)) throw new Error('Invalid embed fixture asset path')
      app.use(path, (_request, response) => {
        response.setHeader('Content-Type', asset.contentType ?? 'text/javascript')
        response.end(asset.body)
      })
    }
    return app.use('/sdk.js', (_request, response) => {
      response.setHeader('Content-Type', 'text/javascript')
      response.end(sdk)
    }).use('/host.html', (_request, response) => {
      response.setHeader('Content-Type', 'text/html')
      response.end(options.html ?? '<!doctype html><div id="mount" style="width:720px;height:560px"></div>')
    })
  }
  const servers = [createServer(application()), createServer(application())]
  try {
    const hostOrigin = await listenOwnedServer(servers[0], 0, '127.0.0.1')
    const deniedOrigin = await listenOwnedServer(servers[1], 0, '127.0.0.1')
    return { hostOrigin, deniedOrigin, sdkInputs: Object.keys(bundle.metafile!.inputs), application, async close() {
      for (const server of servers.reverse()) await closeOwnedServer(server)
    } }
  }
  catch (error) {
    for (const server of servers.reverse()) await closeOwnedServer(server)
    throw error
  }
}
