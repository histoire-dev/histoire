import { expect } from 'vitest'
import { launchEmbedBrowser } from './browser.js'

// Controls replicas share sandbox URL, but never reserve primary runtime ownership.
/** Lists actual primary documents separately from controls replicas. */
function primaryFrames(page: any) {
  return page.frames().filter((frame: any) => frame.url().includes('__sandbox.html') && new URL(frame.url()).searchParams.get('controls') !== 'true')
}

/** Real copied examples exercise installed SDK/native runtime, never repository aliases. */
export async function probeConsumerExamples(origin: string, bookUrl: string, modes: readonly ('explorer' | 'parts' | 'hidden' | 'native')[]) {
  const browser = await launchEmbedBrowser()
  try {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
      const errors: string[] = []
      const vite: string[] = []
      page.on('console', (message) => {
        if (message.text().includes('[vite]')) vite.push(message.text())
      })
      page.setDefaultTimeout(45_000)
      page.on('pageerror', error => errors.push(error.message))
      page.on('response', (response) => {
        if (response.status() >= 400 && !response.url().endsWith('/favicon.ico') && !(response.status() === 404 && response.url().endsWith('/histoire-embed-origins.json'))) errors.push(`${response.status()} ${new URL(response.url()).pathname}`)
      })
      try {
        await page.goto(`${origin}/${mode === 'native' ? 'native' : 'vanilla'}/?source=${encodeURIComponent(bookUrl)}`)
        if (mode === 'native') {
          await page.getByRole('button', { name: 'Connect two sessions', exact: true }).click()
          const variants = page.getByRole('button', { name: /^Deterministic capture \/.+/ })
          await expect.poll(() => variants.count()).toBe(2)
          await variants.nth(0).click()
          await variants.nth(1).click()
          await expect.poll(() => primaryFrames(page).length, { timeout: 45_000 }).toBe(2)
          await expect.poll(async () => {
            const first = primaryFrames(page).find((frame: any) => new URL(frame.url()).searchParams.get('grid') === 'false')
            return first?.locator('[data-capture-label]').textContent().catch(() => null)
          }, { timeout: 45_000 }).toContain('|packed')
          await page.getByRole('textbox', { name: 'Host field', exact: true }).fill('Host remains reactive')
          expect(await page.getByRole('textbox', { name: 'Host field', exact: true }).inputValue()).toBe('Host remains reactive')
          await page.getByRole('textbox', { name: 'Host Vue control', exact: true }).first().fill('Host peer Vue')
          expect(await page.getByText('Host peer Vue', { exact: true }).count()).toBe(1)
          await page.getByRole('button', { name: 'Show variant grid', exact: true }).click()
          await expect.poll(() => primaryFrames(page).filter((frame: any) => new URL(frame.url()).searchParams.get('grid') === 'true').length, { timeout: 45_000 }).toBe(2)
          await page.screenshot({ path: '/tmp/histoire-sdk15-packed-native.png', fullPage: true })
        }
        else {
          await page.getByLabel('View', { exact: true }).selectOption(mode)
          await page.getByRole('button', { name: 'Connect', exact: true }).click()
          if (mode === 'explorer') {
            await expect.poll(() => page.frames().filter(frame => new URL(frame.url()).searchParams.get('surface') === 'explorer').length).toBe(1)
            const explorer = page.frames().find(frame => new URL(frame.url()).searchParams.get('surface') === 'explorer')!
            await explorer.getByRole('button', { name: /^Deterministic capture \/.+/ }).click()
          }
          else {
            const selectors = page.getByLabel('Story / variant', { exact: true })
            await expect.poll(() => selectors.count()).toBe(mode === 'parts' ? 2 : 1)
            expect(primaryFrames(page)).toHaveLength(0)
            for (let index = 0; index < await selectors.count(); index++) await selectors.nth(index).selectOption('0')
            if (mode === 'hidden') {
              expect(primaryFrames(page)).toHaveLength(0)
              await page.getByRole('button', { name: 'Create hidden preview', exact: true }).click()
              await expect.poll(async () => (await page.locator('output').allTextContents()).some(text => text.startsWith('Runtime ready;')), { timeout: 45_000 }).toBe(true)
            }
          }
          await expect.poll(() => primaryFrames(page).length, { timeout: 45_000 }).toBe(mode === 'parts' ? 2 : 1)
          await expect.poll(async () => {
            const frames = primaryFrames(page)
            const labels = await Promise.all(frames.map((frame: any) => frame.locator('[data-capture-label]').textContent().catch(() => null)))
            return labels.length === (mode === 'parts' ? 2 : 1) && labels.every(label => label?.includes('|packed'))
          }, { timeout: 45_000 }).toBe(true)
        }
        expect(await page.getByRole('alert').count()).toBe(0)
        expect(errors, `installed ${mode} against ${new URL(bookUrl).pathname}`).toEqual([])
        // pagehide invokes each example's explicit session disposal.
        await page.goto('about:blank')
        expect(page.frames()).toHaveLength(1)
        expect(errors).toEqual([])
      }
      catch (error) {
        const alerts = await page.getByRole('alert').allTextContents()
        const documents = await Promise.all(primaryFrames(page).map(async (frame: any) => ({ url: frame.url(), label: await frame.locator('[data-capture-label]').textContent({ timeout: 1000 }).catch(() => null) })))
        await page.screenshot({ path: `/tmp/histoire-sdk15-packed-${mode}-failure.png`, fullPage: true })
        throw new Error(`Installed ${mode} failed; page errors: ${errors.join('; ') || 'none'}; alerts: ${alerts.join('; ') || 'none'}; documents: ${JSON.stringify(documents)}; vite: ${vite.slice(-15).join('; ') || 'none'}`, { cause: error })
      }
      finally { await page.close() }
    }
  }
  finally { await browser.close() }
}
