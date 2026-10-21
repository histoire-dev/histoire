import { stripVTControlCharacters } from 'node:util'
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
      // Package layout determines which dependency triggers the reload; require the real event.
      expect(stripVTControlCharacters(sourceLog())).toMatch(/new dependencies optimized: \S[\s\S]*optimized dependencies changed\. reloading/)
    }
    else {
      // Already warm/default readiness improvements remain valid; no replay is needed.
      expect(await page.evaluate('session.getSnapshot().runtime.status')).toBe('ready')
    }
    await page.evaluate('session.dispose()')
    expect(await page.evaluate('session.getSnapshot().status')).toBe('disposed')
    expect(page.frames()).toHaveLength(1)
    // Raw support-plugin imports can trigger another optimization wave after
    // the control bridge connected. Finish that real runtime before testing a
    // fresh Connect in the example, as source-development HMR fixtures do.
    const warm = await browser.newPage()
    try {
      await warm.goto(new URL('__sandbox.html?storyId=deterministic&variantId=normal&embed=true', sourceUrl).href)
      await warm.locator('[data-capture-label]').waitFor({ timeout: 60_000 })
    }
    finally {
      await warm.close()
    }
    // Actual example creates its own new controller through explicit Connect after this teardown.
    return interrupted
  }
  catch (error) {
    throw new Error(`Installed cold source log: ${sourceLog().slice(-8000)}`, { cause: error })
  }
  finally {
    await page.close()
    await browser.close()
  }
}
