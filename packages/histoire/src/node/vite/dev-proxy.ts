import type { Plugin, ResolvedConfig } from 'vite'

/** Private CLI transport policy cannot be replaced by framework Vite hooks. */
export interface DevProxyTransport {
  /** Browser-facing origin owned by lightweight parent. */
  origin: string
  /** Parent-selected identity used for document handoff. */
  generation: string
  /** Reports the configured public address; resolves with the origin the parent settled on. */
  negotiate?: (address: { port?: number, host?: string | boolean }) => Promise<string>
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
