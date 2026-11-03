import type { PreviewStoryCallback } from '@histoire/shared'
import type { Browser } from 'playwright'
import type { AuditReport } from '../messages.js'
import type { BrowserOptions } from '../options.js'
import type { A11yBuildReport, A11yResult } from '../workbench/sources.js'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { normalizeAccessibility } from '@histoire/shared/accessibility'
import { A11Y_BUILD_REPORT_FILE } from '../results.js'

/** Page size used for every variant; matches the screenshot plugin default. */
const VIEWPORT = { width: 1280, height: 800 }

/** Wraps the axe source so it lands on a private global and never replaces a story-owned `window.axe`. */
function privateAxeScript(source: string): string {
  return `(() => { const owned = window.axe; ${source}\n;window.__histoireA11yAxe = window.axe; window.axe = owned })()`
}

/** Launch Chromium through the project's Playwright, with an actionable message when missing. */
async function launchBrowser(): Promise<Browser> {
  let playwright: typeof import('playwright')
  try {
    playwright = await import('playwright')
  }
  catch (error) {
    throw new Error('[HstA11y] The `build` option needs the `playwright` package. Install it and run `npx playwright install chromium`.', { cause: error })
  }
  return playwright.chromium.launch({ headless: true })
}

/**
 * Checks every variant rendered by `histoire build` and writes the report the static book's
 * Accessibility pane reads. Variants are checked one at a time in a shared browser.
 * @param options Scan settings shared with the workbench.
 */
export function createBuildScanner(options: BrowserOptions) {
  const results: A11yResult[] = []
  let browser: Promise<Browser> | undefined
  let axeSource: Promise<string> | undefined

  /** Check one variant document; failures become per-variant errors instead of failing the build. */
  const scan: PreviewStoryCallback = async ({ story, variant, url }) => {
    const target = { storyId: story.id, variantId: variant.id }
    browser ??= launchBrowser()
    axeSource ??= readFile(createRequire(import.meta.url).resolve('axe-core'), 'utf8').then(privateAxeScript)
    const page = await (await browser).newPage({ viewport: VIEWPORT })
    try {
      page.setDefaultTimeout(options.timeoutMs)
      await page.goto(url)
      // The runtime marks the mounted variant root; wait for it, then for pending requests.
      await page.waitForFunction(id => document.querySelector(`[data-histoire-runtime-content][data-histoire-variant-id="${CSS.escape(id)}"]`), variant.id)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.addScriptTag({ content: await axeSource })
      const raw = await page.evaluate(async ({ id, exclude, axe }) => {
        const engine = (window as any).__histoireA11yAxe
        const root = document.querySelector(`[data-histoire-runtime-content][data-histoire-variant-id="${CSS.escape(id)}"]`)!
        const excluded = exclude.flatMap(selector => [...root.matches(selector) ? [root] : [], ...root.querySelectorAll(selector)])
        const empty = { version: engine.version as string, violations: [], incomplete: [], passes: [], inapplicable: [] }
        // A root exclusion means no eligible content, like the live scanner.
        if (excluded.includes(root)) return empty
        const result = await engine.run({ include: [root], exclude: excluded }, axe ?? {})
        // Only what normalization reads crosses the page boundary.
        const finding = (rule: any) => ({ id: rule.id, impact: rule.impact, help: rule.help, helpUrl: rule.helpUrl, nodes: rule.nodes.map((node: any) => ({ target: node.target, failureSummary: node.failureSummary })) })
        return { ...empty, violations: result.violations.map(finding), incomplete: result.incomplete.map(finding), passes: result.passes.map(() => 0), inapplicable: result.inapplicable.map(() => 0) }
      }, { id: variant.id, exclude: options.exclude, axe: options.axe })
      const report: AuditReport = { ...normalizeAccessibility(raw.version, true, raw), violationsCount: raw.violations.length, incompleteCount: raw.incomplete.length }
      results.push({ target, report })
    }
    catch (error) {
      results.push({ target, error: `Accessibility check failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` })
    }
    finally {
      await page.close().catch(() => {})
    }
  }

  /**
   * Write the report into the book and release the browser.
   * @param outputDir Static book directory.
   */
  async function write(outputDir: string): Promise<void> {
    try {
      const report: A11yBuildReport = { version: 1, generatedAt: new Date().toISOString(), results }
      await writeFile(join(outputDir, A11Y_BUILD_REPORT_FILE), JSON.stringify(report))
      const affected = results.filter(result => result.report?.violationsCount).length
      // eslint-disable-next-line no-console -- Build summary line, like other build plugins.
      console.log(`[Accessibility] ${results.length} variants checked, ${affected} with violations`)
    }
    finally {
      await (await browser)?.close()
    }
  }

  return { scan, write }
}
