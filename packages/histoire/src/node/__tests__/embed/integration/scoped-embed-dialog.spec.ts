import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const story = '<template><Story id="normal" title="Normal story"><Variant id="one" title="First"><button>First actor</button></Variant><Variant id="two" title="Second"><button>Second actor</button></Variant></Story></template>'
const files = { 'Other.story.vue': '<template><Story id="other" title="Other story"><Variant id="main"><button>Other actor</button></Variant></Story></template>' }

describe('workbench embed actions', () => {
  it.each(['dev', 'static'] as const)('captures tree targets, restores focus, and offers toolbar/snippet options in %s', async (mode) => {
    const fixture = await createEmbedBridgeFixture({ mode, story, files, config: `routerMode:'${mode === 'static' ? 'hash' : 'history'}',vite:{optimizeDeps:{noDiscovery:true}},` })
    const page = await fixture.browser.newPage({ viewport: { width: 1600, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(fixture.bookUrl)
      await page.getByRole('treeitem', { name: 'Normal story', exact: true }).waitFor()
      await page.getByRole('treeitem', { name: 'Normal story', exact: true }).click()
      const before = page.url()
      const other = page.getByRole('treeitem', { name: 'Other story', exact: true })
      await other.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Embed this story', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Embed this story', exact: true })
      await dialog.waitFor()
      await page.screenshot({ path: `/tmp/histoire-scoped-dialog-${mode}.png` })
      expect(await dialog.getByRole('textbox', { name: 'Embed code' }).inputValue()).toContain('storyId=other')
      expect(await dialog.getByRole('checkbox', { name: 'Controls', exact: true }).isChecked()).toBe(true)
      expect(await dialog.getByRole('checkbox', { name: /^Docs/ }).isDisabled()).toBe(true)
      expect(page.url()).toBe(before)
      await dialog.getByRole('spinbutton', { name: 'Height' }).fill('720')
      expect(await dialog.getByRole('textbox', { name: 'Embed code' }).inputValue()).toContain('height:720px')
      await dialog.getByRole('checkbox', { name: 'Controls', exact: true }).uncheck()
      expect(await dialog.getByRole('textbox', { name: 'Embed code' }).inputValue()).toContain('panels=')
      await dialog.getByRole('tab', { name: 'JavaScript', exact: true }).click()
      expect(await dialog.getByRole('textbox', { name: 'Embed code' }).inputValue()).toContain('scope: \'story\'')
      await dialog.getByRole('tab', { name: 'Vue', exact: true }).click()
      expect(await dialog.getByRole('textbox', { name: 'Embed code' }).inputValue()).toContain('<HistoireEmbed scope="story"')
      // Clipboard is external I/O: delayed results must belong to the copied code.
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise<void>((resolve) => {
        (window as any).finishCopy = resolve
      }) } }))
      await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
      expect(await dialog.getByRole('button', { name: 'Copied', exact: true }).count()).toBe(0)
      await dialog.getByRole('spinbutton', { name: 'Height' }).fill('721')
      await page.evaluate('finishCopy()')
      expect(await dialog.getByRole('button', { name: 'Copied', exact: true }).count()).toBe(0)
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {
        throw new Error('Clipboard denied')
      } } }))
      await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
      await dialog.getByRole('alert').waitFor()
      expect(await dialog.getByRole('textbox', { name: 'Embed code' }).evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBeGreaterThan(100)
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } }))
      await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
      await dialog.getByRole('button', { name: 'Copied', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await expect.poll(() => other.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      // Non-selected tree variant captures its own ID without selecting it.
      await page.getByRole('treeitem', { name: 'Second', exact: true }).click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Embed this variant', exact: true }).click()
      const variant = page.getByRole('dialog', { name: 'Embed this variant', exact: true })
      await variant.waitFor()
      expect(await variant.getByRole('textbox', { name: 'Embed code' }).inputValue()).toContain('variantId=two')
      expect(await variant.getByRole('spinbutton', { name: 'Height' }).inputValue()).toBe('600')
      expect(page.url()).toBe(before)
      await variant.getByRole('button', { name: 'Close', exact: true }).click()
      const embed = page.getByRole('button', { name: 'Embed', exact: true })
      await embed.click()
      expect(await page.getByRole('button', { name: 'Embed this variant', exact: true }).isDisabled()).toBe(true)
      await page.getByRole('button', { name: 'Embed this story', exact: true }).click()
      await dialog.waitFor()
      expect(await dialog.getByRole('textbox', { name: 'Embed code' }).inputValue()).toContain('storyId=normal')
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await expect.poll(() => embed.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      if (mode === 'dev') {
        await other.click({ button: 'right' })
        await page.getByRole('menuitem', { name: 'Embed this story', exact: true }).click()
        await dialog.waitFor()
        await writeFile(join(fixture.root, 'Other.story.vue'), files['Other.story.vue'].replace('id="other"', 'id="changed"'))
        await dialog.getByText('Target unavailable', { exact: true }).waitFor()
        expect(await dialog.getByRole('textbox', { name: 'Embed code' }).count()).toBe(0)
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      }
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('shows setup guidance instead of unusable snippets when public embedding is disabled', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', embedding: false, story })
    const page = await fixture.browser.newPage()
    try {
      await page.goto(fixture.bookUrl)
      await page.getByRole('treeitem', { name: 'Normal story', exact: true }).waitFor()
      await page.getByRole('treeitem', { name: 'Normal story', exact: true }).click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Embed this story', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Embed this story', exact: true })
      await expect.poll(() => dialog.getByText('Embedding is disabled', { exact: true }).count()).toBe(1)
      expect(await dialog.getByRole('textbox', { name: 'Config code' }).inputValue()).toContain('enabled: true')
      expect(await dialog.getByRole('textbox', { name: 'Embed code' }).count()).toBe(0)
      expect(await dialog.getByRole('button', { name: 'Open embed' }).count()).toBe(0)
      expect((await fetch(new URL('__embed.html', fixture.bookUrl))).status).toBe(404)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
