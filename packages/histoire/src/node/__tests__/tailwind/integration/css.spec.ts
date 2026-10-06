import { describe, expect, it } from 'vitest'
import { scopeTailwindCss } from '../../../builtin-plugins/tailwind/css.js'
import { launchEmbedBrowser } from '../../utils/embed/browser.js'

describe('tailwind contextual theme scoping', () => {
  it('keeps document-root class and attribute conditions without affecting another source', async () => {
    const browser = await launchEmbedBrowser()
    const page = await browser.newPage()
    try {
      const css = scopeTailwindCss(`:root { --brand: #123456; }
        :root.dark { --brand: #654321; }
        :root[data-theme="alternate"] { --brand: #112233; }
        .bg-brand { background-color: var(--brand); }`, 'main', new Set(['bg-brand']), {})
      const other = scopeTailwindCss(':root { --brand: #abcdef; } .bg-brand { background-color: var(--brand); }', 'other', new Set(['bg-brand']), {})
      await page.setContent(`<style>${css}${other}</style><div data-tailwind-source="main"><div class="bg-brand"></div></div><div data-tailwind-source="other"><div class="bg-brand"></div></div>`)
      /** Read browser-resolved token colors rather than generated selector text. */
      const colors = () => page.locator('.bg-brand').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor))
      expect(await colors()).toEqual(['rgb(18, 52, 86)', 'rgb(171, 205, 239)'])
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      expect(await colors()).toEqual(['rgb(101, 67, 33)', 'rgb(171, 205, 239)'])
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark')
        document.documentElement.setAttribute('data-theme', 'alternate')
      })
      expect(await colors()).toEqual(['rgb(17, 34, 51)', 'rgb(171, 205, 239)'])
    }
    finally { await browser.close() }
  })
})
