import { closePreviewBrowser } from '../../../mcp/browser/cleanup.js'
import { resolvePreviewBrowser } from '../../../mcp/browser/dependencies.js'
import { MCP_REPOSITORY_ROOT } from './cli-project.js'

/** Inspect normal book iframe when automation readiness fails, always headless. */
export async function inspectMcpFrameworkPreview(url: string) {
  const launch = await resolvePreviewBrowser(`${MCP_REPOSITORY_ROOT}/examples/vue3`)
  const browser = await launch({ headless: true })
  const diagnostics: string[] = []
  try {
    const page = await browser.newPage()
    const scrub = (value: string) => value.replaceAll(MCP_REPOSITORY_ROOT, '[repository]').replace(/https?:\/\/\S+/g, '[local URL]').slice(0, 2000)
    page.on('pageerror', error => diagnostics.push(scrub(error.message)))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(scrub(message.text()))
    })
    await page.goto(url, { timeout: 20000 })
    let rendered = false
    try {
      await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).some(frame => !!frame.contentDocument?.querySelector('button')), undefined, { timeout: 15000 })
      rendered = true
    }
    catch {}
    return { rendered, diagnostics: diagnostics.slice(0, 6) }
  }
  finally { await closePreviewBrowser(browser) }
}
