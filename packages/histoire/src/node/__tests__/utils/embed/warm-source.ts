import type { HistoireTarget } from '@histoire/protocol'
import type { Browser } from 'playwright'

/**
 * Test-owned sandbox page completes cold dev dependency optimization before a
 * consumer connects, so Vite's optimizer reload cannot retire its session later.
 * @param browser Fixture browser.
 * @param bookUrl Book base URL.
 * @param target Variant rendered by the warming sandbox.
 * @param readyButton Exact accessible name of a button rendered once the variant is mounted.
 */
export async function warmEmbedSandbox(browser: Browser, bookUrl: string, target: HistoireTarget, readyButton: string): Promise<void> {
  const page = await browser.newPage()
  try {
    const url = new URL('__sandbox.html', bookUrl)
    url.search = new URLSearchParams({ storyId: target.storyId, variantId: target.variantId ?? '', embed: 'true' }).toString()
    await page.goto(url.href)
    await page.getByRole('button', { name: readyButton, exact: true }).waitFor({ timeout: 60_000 })
  }
  finally { await page.close() }
}
