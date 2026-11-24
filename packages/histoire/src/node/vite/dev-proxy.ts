import type { Plugin, ResolvedConfig, ServerOptions } from 'vite'

/** Private CLI transport policy cannot be replaced by framework Vite hooks. */
export interface DevProxyTransport {
  /** Browser-facing origin owned by lightweight parent. */
  origin: string
  /** Parent-selected identity used for document handoff. */
  generation: string
  /** Public address flags given on the command line: the only inputs able to move the public listener. */
  cli?: { port?: boolean, host?: boolean }
}

/** Port Histoire merges into every project Vite config; any other value was configured by the project. */
const DEFAULT_PORT = 6006

/**
 * Lists the configured public address options the proxy cannot honor: it binds
 * before project config loads, so only `--port` and `--host` reach it.
 * @param server The project Vite server options, before Histoire pins the private listener.
 * @param transport The proxy transport, carrying which flags the command line gave.
 */
export function getIgnoredPublicAddressWarnings(server: Pick<ServerOptions, 'port' | 'host'> | undefined, transport: DevProxyTransport): string[] {
  const warnings: string[] = []
  if (!transport.cli?.port && server?.port !== undefined && server.port !== DEFAULT_PORT) {
    warnings.push(`server.port (${server.port}) is ignored by \`histoire dev\`: use \`histoire dev --port ${server.port}\``)
  }
  if (!transport.cli?.host && server?.host) {
    const value = typeof server.host === 'string' ? ` ${server.host}` : ''
    warnings.push(`server.host is ignored by \`histoire dev\`: use \`histoire dev --host${value}\``)
  }
  return warnings
}

/** Pin private listener while browser connections retain public origin and configured paths. */
export function createDevProxyPlugin(transport: DevProxyTransport, collecting: boolean): Plugin {
  return {
    name: 'histoire:dev-proxy-transport',
    enforce: 'post',
    configResolved(config: ResolvedConfig) {
      const origin = new URL(transport.origin)
      const server = config.server
      server.host = '127.0.0.1'
      server.port = 0
      // Public proxy binds before project config loads, so it can only serve plain HTTP.
      if (server.https) config.logger.warn('server.https is not supported by `histoire dev`: stories are served over HTTP')
      server.https = undefined
      server.strictPort = true
      server.origin = transport.origin
      config.__histoireProxyOpen = server.open
      server.open = false
      if (collecting) {
        server.hmr = false
        server.ws = false
        return
      }
      const socket = { ...(typeof server.hmr === 'object' ? server.hmr : {}), ...(typeof server.ws === 'object' ? server.ws : {}) }
      // Proxy serves WebSockets on page origin: client derives host, port and protocol from
      // page URL, which keeps LAN, port-forwarded and TLS-terminated access working.
      delete socket.host
      delete socket.port
      delete socket.server
      server.hmr = { ...socket }
      server.ws = { ...socket }
      if (server.allowedHosts !== true && !server.allowedHosts.includes(origin.hostname)) server.allowedHosts.push(origin.hostname)
    },
    transformIndexHtml(html, context) {
      if (collecting || context.path.includes('__sandbox') || context.path.includes('__histoire')) return html
      return [{ tag: 'script', attrs: { 'type': 'module', 'src': '/__histoire/dev/lifecycle.js', 'data-histoire-generation': transport.generation, 'data-histoire-base': context.server?.config.base ?? '/' }, injectTo: 'head' }]
    },
  }
}

declare module 'vite' {
  interface ResolvedConfig {
    /** Configured browser opening deferred to proxy parent. */
    __histoireProxyOpen?: boolean | string
  }
}
