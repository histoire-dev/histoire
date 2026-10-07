import { describe, expect, it } from 'vitest'
import { createTailwindBook } from '../../utils/tailwind-browser.js'

describe('tailwind Single variant workbench', () => {
  it.each([['dev', 3], ['static', 3], ['dev', 4], ['static', 4]] as const)('uses native Single view in %s Tailwind v%i books', async (mode, version) => {
    const fixture = await createTailwindBook(version, mode)
    const page = await fixture.browser.newPage({ viewport: { width: 1400, height: 1000 } })
    const errors: string[] = []
    const consoleErrors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.addInitScript(() => {
      const failures: unknown[] = []
      Object.assign(window, { runtimeFailures: failures })
      window.addEventListener('message', (event) => {
        if (String(event.data?.type).includes('failed')) failures.push(event.data)
      })
    })
    try {
      const story = fixture.catalog.stories.find(story => version === 3 ? story.id === 'tailwind' : story.title.includes('main.css'))!
      expect(story.layoutExplicit).toBe(true)
      await page.goto(`${fixture.bookUrl}#/story/${encodeURIComponent(story.id)}?variantId=background-color`)
      const single = page.getByRole('button', { name: 'Single variant', exact: true })
      await expect.poll(() => single.getAttribute('aria-pressed'), { timeout: 15_000 }).toBe('true')
      expect(page.url()).not.toContain('arrange=')
      const surface = page.locator('.histoire-single-variant')
      const iframe = surface.locator('iframe')
      await expect.poll(() => iframe.count(), { timeout: 15_000 }).toBe(1)
      const runtime = () => page.frames().find(frame => frame.url().includes('__sandbox.html') && new URL(frame.url()).searchParams.get('storyId') === story.id && new URL(frame.url()).searchParams.get('controls') !== 'true')!
      const controls = () => page.frames().find(frame => frame.url().includes('__sandbox.html') && new URL(frame.url()).searchParams.get('controls') === 'true')!
      const token = version === 3 ? 'ac-bg-brand' : 'bg-brand'
      await expect.poll(() => runtime().locator(`[data-tailwind-value="${token}"]`).count(), { timeout: 15_000 }).toBe(1)
      expect(await runtime().evaluate(() => {
        const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
        const space = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })
        document.body.dispatchEvent(wheel)
        document.body.dispatchEvent(space)
        return [wheel.defaultPrevented, space.defaultPrevented]
      })).toEqual([false, false])
      expect(await page.getByRole('button', { name: 'Pan', exact: true }).count()).toBe(0)
      expect(await page.getByRole('button', { name: 'Zoom in', exact: true }).count()).toBe(1)
      const documentUrl = await iframe.getAttribute('src')
      expect(new URL(documentUrl!, fixture.bookUrl).searchParams.get('nativeScroll')).toBe('true')
      const before = await iframe.boundingBox()
      expect(before!.width).toBe((await surface.boundingBox())!.width)
      await page.setViewportSize({ width: 1200, height: 900 })
      await expect.poll(async () => (await iframe.boundingBox())!.width).toBeLessThan(before!.width)
      expect(await iframe.getAttribute('src')).toBe(documentUrl)
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      const width = page.getByRole('textbox', { name: 'Custom width' })
      await width.fill('390')
      await width.press('Tab')
      await expect.poll(() => runtime().evaluate('innerWidth')).toBe(390)
      expect(await iframe.getAttribute('src')).toBe(documentUrl)
      const height = page.getByRole('textbox', { name: 'Custom height' })
      await height.fill('100')
      await height.press('Tab')
      await expect.poll(() => runtime().evaluate('innerHeight')).toBe(100)
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      const small = (await iframe.boundingBox())!
      await page.mouse.move(small.x + 30, small.y + 30)
      await page.mouse.wheel(0, 200)
      await expect.poll(() => runtime().evaluate(() => scrollY > 0 || document.body.scrollTop > 0 || [...document.querySelectorAll('.__histoire-render-story')].some(element => element.scrollTop > 0))).toBe(true)
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      await width.fill('1600')
      await width.press('Tab')
      await height.fill('1000')
      await height.press('Tab')
      await expect.poll(() => runtime().evaluate('innerWidth')).toBe(1600)
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      await expect.poll(async () => {
        const area = (await surface.boundingBox())!
        const displayed = (await iframe.boundingBox())!
        return Math.abs(displayed.width - 1600 * Math.min(1, area.width / 1600, area.height / 1000))
      }).toBeLessThan(1)
      expect(await runtime().evaluate('innerHeight')).toBe(1000)
      expect(await iframe.getAttribute('src')).toBe(documentUrl)
      const fittedWidth = (await iframe.boundingBox())!.width
      await page.setViewportSize({ width: 1100, height: 800 })
      await expect.poll(async () => (await iframe.boundingBox())!.width).toBeLessThan(fittedWidth)
      const canvas = page.locator('.histoire-canvas-viewport')
      await canvas.focus()
      await page.keyboard.press('Shift+0')
      await expect.poll(async () => (await iframe.boundingBox())!.width).toBe(1600)
      const scrollArea = (await surface.boundingBox())!
      await page.mouse.move(scrollArea.x + scrollArea.width - 5, scrollArea.y + 30)
      await page.mouse.wheel(200, 200)
      await expect.poll(() => surface.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
      await expect.poll(() => surface.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      /** Read logical document coordinates beneath one fixed canvas cursor. */
      const documentPoint = () => iframe.evaluate((element, point) => {
        const rect = element.getBoundingClientRect()
        return { x: (point.x - rect.left) * element.clientWidth / rect.width, y: (point.y - rect.top) * element.clientHeight / rect.height }
      }, { x: scrollArea.x + 200, y: scrollArea.y + 200 })
      const logicalAnchor = await documentPoint()
      await surface.evaluate((element, point) => element.dispatchEvent(new WheelEvent('wheel', { ...point, deltaY: -80, ctrlKey: true, bubbles: true, cancelable: true })), { clientX: scrollArea.x + 200, clientY: scrollArea.y + 200 })
      await expect.poll(async () => (await iframe.boundingBox())!.width).toBeGreaterThan(1600)
      await expect.poll(async () => {
        const point = await documentPoint()
        return Math.hypot(point.x - logicalAnchor.x, point.y - logicalAnchor.y)
      }).toBeLessThan(1)
      expect(await runtime().evaluate(() => {
        const wheel = new WheelEvent('wheel', { deltaY: 80, clientX: 200, clientY: 200, ctrlKey: true, bubbles: true, cancelable: true })
        document.body.dispatchEvent(wheel)
        return wheel.defaultPrevented
      })).toBe(true)
      expect(await iframe.getAttribute('src')).toBe(documentUrl)
      await expect.poll(async () => (await iframe.boundingBox())!.width).toBeCloseTo(1600, 0)
      await canvas.focus()
      await page.keyboard.press('Shift+1')
      await expect.poll(() => surface.evaluate(element => [element.scrollLeft, element.scrollTop])).toEqual([0, 0])
      await page.setViewportSize({ width: 1400, height: 1000 })
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      await page.getByRole('button', { name: 'Fill viewport', exact: false }).click()
      await expect.poll(() => runtime().evaluate('innerWidth')).toBeGreaterThan(390)
      expect(await iframe.getAttribute('src')).toBe(documentUrl)
      await expect.poll(() => !!controls(), { timeout: 15_000 }).toBe(true)
      const filter = controls().getByRole('textbox', { name: 'Filter tokens', exact: true })
      await expect.poll(() => filter.count(), { timeout: 15_000 }).toBe(1)
      await filter.fill('no-matching-token')
      await expect.poll(() => runtime().getByRole('status').textContent()).toBe('No matching tokens')
      await filter.fill('brand')
      await expect.poll(() => runtime().locator(`[data-tailwind-value="${token}"]`).count()).toBe(1)
      const typography = story.variants.find(variant => variant.id === 'font-size')!
      await page.getByRole('treeitem', { name: typography.title, exact: true }).click()
      await expect.poll(() => surface.locator('iframe').count()).toBe(1)
      await expect.poll(() => controls().getByRole('textbox', { name: 'Sample text', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      await controls().getByRole('textbox', { name: 'Sample text', exact: true }).fill('Changed Single sample')
      await expect.poll(() => runtime().locator('[data-tailwind-value$="text-lg"]').textContent()).toBe('Changed Single sample')
      for (const arrangement of ['Grid', 'List', 'Single variant']) {
        await page.getByRole('button', { name: arrangement, exact: true }).click()
        await expect.poll(() => page.getByRole('button', { name: arrangement, exact: true }).getAttribute('aria-pressed')).toBe('true')
      }
      await expect.poll(() => surface.locator('iframe').count(), { timeout: 15_000 }).toBe(1)
      await expect.poll(() => runtime().locator('[data-tailwind-value$="text-lg"]').textContent(), { timeout: 15_000 }).toBe('Changed Single sample')
      await expect.poll(() => !!controls(), { timeout: 15_000 }).toBe(true)
      await page.screenshot({ path: `/tmp/histoire-single-tailwind-v${version}-${mode}.png` })
      expect(errors).toEqual([])
    }
    catch (error) {
      await page.screenshot({ path: `/tmp/histoire-single-tailwind-v${version}-${mode}-failure.png` }).catch(() => {})
      throw new Error(`${String(error)}; console: ${consoleErrors.join('; ')}; runtime: ${await page.evaluate('JSON.stringify(window.runtimeFailures)')}`, { cause: error })
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
