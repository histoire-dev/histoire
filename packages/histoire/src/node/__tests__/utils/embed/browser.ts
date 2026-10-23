import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect } from 'vitest'
import { MCP_REPOSITORY_ROOT } from '../mcp/cli-project.js'

/** Ready selected workbench actor; excludes hidden canonical and sibling runtimes. */
export const STANDALONE_SELECTED_FRAME = '.histoire-canvas-frame.is-selected [aria-busy="false"] iframe[title="Histoire variant"]'

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

/**
 * Tracks main-frame navigations from now on. Dev servers reload the book while
 * Vite discovers dependencies; `settled()` waits until the page stayed put for
 * three seconds, so test-owned page state is not dropped by a late reload.
 * @param page Playwright page, tracked before its first `goto`.
 */
export function trackPageReloads(page: any) {
  let navigatedAt = Date.now()
  page.on('framenavigated', (frame: unknown) => {
    if (frame === page.mainFrame()) navigatedAt = Date.now()
  })
  return {
    settled: () => expect.poll(() => Date.now() - navigatedAt, { interval: 500, timeout: 30_000 }).toBeGreaterThan(3000),
  }
}
