import { createRequire } from 'node:module'
import { join } from 'node:path'
import { MCP_REPOSITORY_ROOT } from '../mcp/cli-project.js'

/** Real browser launcher shared by embed conformance; remote WebKit works on unsupported hosts. */
export async function launchEmbedBrowser() {
  const require = createRequire(join(MCP_REPOSITORY_ROOT, 'examples/vue3/package.json'))
  const playwright = await import(require.resolve('playwright'))
  const name = process.env.HISTOIRE_EMBED_BROWSER ?? 'chromium'
  if (!['chromium', 'firefox', 'webkit'].includes(name)) throw new Error('Unknown embed browser')
  const browserType = playwright[name]
  const endpoint = process.env.HISTOIRE_EMBED_BROWSER_WS_ENDPOINT
  return endpoint ? browserType.connect(endpoint) : browserType.launch({ headless: true })
}

/** Reads public source connection without installing globals or importing any story. */
export async function readEmbedBrowserSource(page: any) {
  // Keep browser module syntax outside Vitest's SSR dynamic-import transform.
  return page.evaluate(`(async () => {
    const script = document.querySelector('script[type="module"][src]:not([src*="@vite/client"])')
    const module = await import(script.src)
    const connection = await module.sourceConnection
    return { descriptor: connection.descriptor, allowedOrigins: connection.allowedOrigins }
  })()`)
}
