import type { Browser } from 'playwright'
import type { ViteDevServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let server: ViteDevServer
let browser: Browser
let url: string
/** Narrow rule selection makes expected findings independent of surrounding fixture semantics. */
const options = { axe: { runOnly: { type: 'rule', values: ['image-alt', 'button-name'] } }, exclude: ['.excluded'] }

beforeAll(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  await server.listen()
  url = `${server.resolvedUrls!.local[0]}src/__tests__/fixture.html`
  browser = await chromium.launch({ headless: true })
})
afterAll(async () => {
  await browser?.close()
  await server?.close()
})

describe('real axe scanner and public assertion', () => {
  it('scopes findings, preserves story axe global and observes repairs', async () => {
    const page = await browser.newPage()
    try {
      await page.addInitScript(() => {
        (window as any).axe = { storyOwned: true }
      })
      await page.goto(url)
      await page.waitForFunction(() => Boolean((window as any).fixture))
      const report = await page.evaluate(options => (window as any).fixture.scan(options), options)
      expect(report.violations.map((rule: any) => rule.id).sort()).toEqual(['button-name', 'image-alt'])
      const targets = report.violations.flatMap((rule: any) => rule.nodes.flatMap((node: any) => node.selectors))
      expect(targets.sort()).toEqual(['#story-button', '#story-image'])
      expect(await page.evaluate(() => (window as any).axe)).toEqual({ storyOwned: true })
      expect(await page.evaluate(options => (window as any).fixture.assert(options), options)).toContain('2 accessibility violations')
      await page.evaluate(() => (window as any).fixture.repair())
      expect(await page.evaluate(options => (window as any).fixture.assert(options), options)).toBe('passed')
      // Legitimate long ID exceeds channel selector bound; complete raw policy must still fail.
      await page.evaluate(() => {
        (window as any).fixture.repair()
        const image = document.querySelector('#story-image')!
        image.removeAttribute('alt')
        image.id = 'x'.repeat(600)
      })
      const bounded = await page.evaluate(options => (window as any).fixture.scan(options), options)
      expect(bounded.violationsCount).toBe(1)
      expect(bounded.droppedCount).toBeGreaterThan(0)
      expect(await page.evaluate(options => (window as any).fixture.assert(options), options)).toContain('1 accessibility violation')
      const excluded = await page.evaluate(options => (window as any).fixture.scan({ ...options, exclude: ['#variant'] }), options)
      expect(excluded.violations).toEqual([])
    }
    finally { await page.close() }
  })

  it('attaches bounded findings to failing test results', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(url)
      await page.waitForFunction(() => Boolean((window as any).fixture))
      const data = await page.evaluate(options => (window as any).fixture.data(options), options)
      expect(data.a11y.report.violationsCount).toBe(2)
      expect(data.a11y.report.violations.map((rule: any) => rule.id).sort()).toEqual(['button-name', 'image-alt'])
    }
    finally { await page.close() }
  })

  it('applies rule overrides and rejects invalid selectors/rules rather than passing', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(url)
      await page.waitForFunction(() => Boolean((window as any).fixture))
      const report = await page.evaluate(options => (window as any).fixture.scan({ ...options, axe: { rules: { 'image-alt': { enabled: false } } } }), options)
      expect(report.violations.map((rule: any) => rule.id)).toContain('button-name')
      expect(report.violations.map((rule: any) => rule.id)).not.toContain('image-alt')
      expect(await page.evaluate(options => (window as any).fixture.assert({ ...options, exclude: ['['] }), options)).toContain('Accessibility scan failed')
      expect(await page.evaluate(() => (window as any).fixture.assert({ axe: { rules: { 'not-real': { enabled: false } } } }))).toContain('Unknown axe rule: not-real')
    }
    finally { await page.close() }
  })

  it('uses tag selection and severity threshold with actual axe findings', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(url)
      await page.waitForFunction(() => Boolean((window as any).fixture))
      const tags = await page.evaluate(() => (window as any).fixture.scan({ axe: { runOnly: { type: 'tag', values: ['wcag2a'] } }, exclude: ['.excluded'] }))
      expect(tags.violations.map((rule: any) => rule.id)).toContain('image-alt')
      const scan = { axe: { runOnly: { type: 'rule', values: ['color-contrast'] } } }
      expect(await page.evaluate(scan => (window as any).fixture.assert({ ...scan, minimumImpact: 'serious' }), scan)).toContain('color-contrast [serious]')
      expect(await page.evaluate(scan => (window as any).fixture.assert({ ...scan, minimumImpact: 'critical' }), scan)).toBe('passed')
    }
    finally { await page.close() }
  })
})
