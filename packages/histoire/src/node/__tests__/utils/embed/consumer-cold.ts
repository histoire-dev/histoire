import { expect } from 'vitest'
import { launchEmbedBrowser } from './browser.js'
import { attemptEmbedPrimary } from './primary-session.js'

/** Default dev optimization can retire source; explicit caller then disposes before fresh Connect. */
export async function proveConsumerColdSource(hostOrigin: string, sourceUrl: string, sourceLog: () => string) {
  const browser = await launchEmbedBrowser()
  const page = await browser.newPage()
  try {
    await page.goto(`${hostOrigin}/host.html`)
    const interrupted = await attemptEmbedPrimary(page, sourceUrl, { storyId: 'deterministic', variantId: 'normal' }, 'explorer')
    if (interrupted) {
      expect(interrupted).toEqual({ code: 'NOT_CONNECTED', status: 'disconnected', stale: true })
      expect(sourceLog()).toMatch(/new dependencies optimized: vue[\s\S]*optimized dependencies changed\. reloading/)
    }
    else {
      // Already warm/default readiness improvements remain valid; no replay is needed.
      expect(await page.evaluate('session.getSnapshot().runtime.status')).toBe('ready')
    }
    await page.evaluate('session.dispose()')
    expect(await page.evaluate('session.getSnapshot().status')).toBe('disposed')
    expect(page.frames()).toHaveLength(1)
    // Actual example creates its own new controller through explicit Connect after this teardown.
    return interrupted
  }
  finally {
    await page.close()
    await browser.close()
  }
}
