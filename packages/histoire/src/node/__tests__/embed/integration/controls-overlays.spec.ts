import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { embedControlsHostHtml, embedControlsStory, embedCustomControlsFrame, mountEmbedControlsHost, waitEmbedControlsReady, warmEmbedControlsSource } from '../../utils/embed/controls-host.js'
import { createEmbedVueHostAssets } from '../../utils/embed/vue-host.js'

describe('cross-origin controls overlays', () => {
  it.each(['dev', 'static'] as const)('%s source escapes nested frames with opaque values, scaled geometry, keyboard and intrinsic height', async (mode) => {
    const fixture = await createEmbedBridgeFixture({ mode, story: embedControlsStory, files: { 'greeting.ts': 'export const greeting=()=> "unmocked"' }, hostHtml: embedControlsHostHtml, hostModules: await createEmbedVueHostAssets() })
    const page = await fixture.browser.newPage({ viewport: { width: 1380, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.stack ?? error.message))
    const consoleErrors: string[] = []
    page.on('response', (response) => {
      if (response.status() >= 400) {
        consoleErrors.push(`${response.status()} ${response.url()}`)
      }
    })
    page.on('requestfailed', request => consoleErrors.push(`${request.url()}: ${request.failure()?.errorText}`))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleErrors.push(message.text())
      }
    })
    try {
      if (mode === 'dev') {
        await warmEmbedControlsSource(fixture.browser, fixture.bookUrl)
      }
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const hostBefore = await page.locator('#host-field').boundingBox()
      await mountEmbedControlsHost(page, fixture.bookUrl)
      await Promise.all([waitEmbedControlsReady(page), waitEmbedControlsReady(page, 1)])
      await expect.poll(() => page.frames().filter(frame => frame.url().includes('controls=true')).length, { timeout: 30000 }).toBe(2)
      const custom = () => embedCustomControlsFrame(page)
      await expect.poll(() => embedCustomControlsFrame(page, 1)?.getByRole('button', { name: 'Choice', exact: true }).isVisible(), { timeout: 30000 }).toBe(true)
      await expect.poll(() => custom()?.getByRole('button', { name: 'Choice', exact: true }).isVisible()).toBe(true)
      const choice = () => custom().getByRole('button', { name: 'Choice', exact: true })
      await custom().getByRole('textbox', { name: 'Label', exact: true }).fill('Replica edit')
      await expect.poll(() => page.evaluate('sessions[0].state.get().then(state=>state.value.label)')).toBe('Replica edit')
      await page.evaluate('sessions[0].state.patch({label:"Primary edit"})')
      await expect.poll(() => custom().getByRole('textbox', { name: 'Label', exact: true }).inputValue()).toBe('Primary edit')
      const menu = page.locator('#first [role=listbox]')
      /** Keyboard input follows actual asynchronously relayed listbox focus. */
      async function openMenu(): Promise<void> {
        await choice().click()
        await expect.poll(() => menu.isVisible()).toBe(true)
        await expect.poll(() => menu.getByRole('option').evaluateAll(elements => elements.some(element => element === element.ownerDocument.activeElement))).toBe(true)
      }
      await openMenu()
      // FloatingVue's inner shell owns border; listbox starts one local pixel inside.
      const shell = menu.locator('xpath=ancestor::*[@data-popper-placement][1]')
      /** Current focus stays fully visible when vendor recomputes finite bounds. */
      async function expectLastChoiceVisible(): Promise<void> {
        await expect.poll(async () => {
          const option = (await menu.getByRole('option', { name: 'Choice 49', exact: true }).boundingBox())!
          const bounds = (await shell.boundingBox())!
          return option.y >= bounds.y - 1 && option.y + option.height <= bounds.y + bounds.height + 1
        }).toBe(true)
      }
      await expect.poll(() => menu.isVisible()).toBe(true)
      expect(await page.locator('#second [role=listbox]').count()).toBe(0)
      const anchor = await choice().boundingBox()
      // FloatingVue animates its first visible frame; inspect settled geometry.
      await expect.poll(async () => (await shell.boundingBox())!.x).toBeCloseTo(anchor!.x, 0)
      const menuBounds = await menu.boundingBox()
      const frameBounds = await page.locator('#first .histoire-custom-controls > iframe').boundingBox()
      expect(menuBounds!.height).toBeGreaterThan(frameBounds!.height)
      await page.keyboard.press('End')
      await expect.poll(() => menu.getByRole('option', { name: 'Choice 49', exact: true }).evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      await expectLastChoiceVisible()
      await page.keyboard.press('Enter')
      await expect.poll(() => page.evaluate('sessions[0].state.get().then(state=>[state.value.choice.name,state.value.count,state.value.callbackCount])')).toEqual(['Choice 49', 49, 50])
      expect(await page.evaluate('sessions[1].state.get().then(state=>state.value.choice.name)')).toBe('Choice 0')
      await openMenu()
      await page.keyboard.press('Escape')
      await expect.poll(() => menu.count()).toBe(0)
      await expect.poll(() => choice().evaluate((element: HTMLElement) => element === element.ownerDocument.activeElement)).toBe(true)
      await openMenu()
      await page.keyboard.press('Tab')
      await expect.poll(() => custom().getByRole('textbox', { name: 'Next control' }).evaluate((element: HTMLElement) => element === element.ownerDocument.activeElement)).toBe(true)
      // Last local control resumes traversal beside owning cross-origin iframe.
      await custom().getByRole('textbox', { name: 'Next control' }).evaluate(element => element.remove())
      await openMenu()
      await page.keyboard.press('Tab')
      await expect.poll(() => page.locator('#after-first').evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      await openMenu()
      await page.keyboard.press('Shift+Tab')
      await expect.poll(() => custom().getByRole('textbox', { name: 'Extra field' }).evaluate((element: HTMLElement) => element === element.ownerDocument.activeElement)).toBe(true)
      await openMenu()
      await page.locator('#after-first').click()
      await expect.poll(() => menu.count()).toBe(0)
      const expanded = await page.locator('#first .histoire-custom-controls > iframe').boundingBox()
      await custom().getByRole('checkbox', { name: 'Extra controls' }).uncheck()
      await expect.poll(async () => (await page.locator('#first .histoire-custom-controls > iframe').boundingBox())!.height).toBeLessThan(expanded!.height - 50)
      await custom().getByRole('checkbox', { name: 'Extra controls' }).check()
      await expect.poll(async () => (await page.locator('#first .histoire-custom-controls > iframe').boundingBox())!.height).toBeCloseTo(expanded!.height, 0)
      await openMenu()
      await page.evaluate('window.scrollTo(0,100)')
      await expect.poll(async () => (await shell.boundingBox())!.x - (await choice().boundingBox())!.x).toBeCloseTo(0, 0)
      await page.evaluate('document.querySelector("#first").style.width="470px"')
      await expect.poll(async () => (await shell.boundingBox())!.x - (await choice().boundingBox())!.x).toBeCloseTo(0, 0)
      await expect.poll(() => menu.getByRole('option', { name: 'Choice 49', exact: true }).evaluate(element => element === element.ownerDocument.activeElement)).toBe(true)
      await expectLastChoiceVisible()
      // WebKit full-page capture changes viewport while photographing poppers.
      // Capture current viewport after keyboard checks, preserving runtime geometry.
      await page.screenshot({ path: `/tmp/histoire-sdk-10-${mode}-${process.env.HISTOIRE_EMBED_BROWSER ?? 'chromium'}-controls-menu.png` })
      await page.keyboard.press('Escape')
      expect(await page.locator('#host-field').boundingBox()).toEqual({ ...hostBefore!, y: hostBefore!.y - 100 })
      expect(await page.locator('#host-field').inputValue()).toBe('Host value')
      expect(await page.evaluate('nativeErrors')).toEqual([])
      expect(errors).toEqual([])
    }
    catch (error) {
      console.error('Menu scrolling', await page.locator('#first [role=listbox]').evaluate((element) => {
        const values = []
        for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
          const style = getComputedStyle(node)
          values.push({ name: node.className, height: node.clientHeight, scroll: node.scrollHeight, top: node.scrollTop, overflow: style.overflowY, maxHeight: style.maxHeight, bounds: node.getBoundingClientRect().toJSON() })
        }
        return values
      }).catch(() => null))
      console.error({ errors, consoleErrors, nativeErrors: await page.evaluate('window.nativeErrors'), state: await page.evaluate('sessions[0]?.state.get().then(state=>({choice:state.value.choice.name,expanded:state.value.expanded}))').catch(() => null), frames: page.frames().map(frame => frame.url()) })
      await page.screenshot({ path: '/tmp/histoire-sdk-10-controls-failure.png', fullPage: true })
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
