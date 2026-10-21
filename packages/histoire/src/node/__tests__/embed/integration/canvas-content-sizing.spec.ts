import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { linkEmbedFixturePlaywright } from '../../utils/embed/project.js'

/** Known independent dimensions exercise actual framework actors and state restoration. */
const story = `<template><Story id="content" title="Content sizes" :init-state="()=>({large:false,count:0})">
  <Variant id="first" title="First" v-slot="{state}"><div data-box="first" :style="{boxSizing:'border-box',padding:'10px',width:(state.large?240:120)+'px',height:(state.large?150:60)+'px'}"><button @click="state.large=!state.large">Toggle size</button><button @click="state.count++">Count {{state.count}}</button></div></Variant>
  <Variant id="second" title="Second"><div data-box="second" style="width:200px;height:90px">Second</div></Variant>
  <Variant id="empty" title="Empty"><span /></Variant>
</Story></template>`

/** Read logical frame pixels and actual sandbox viewport, excluding camera transforms. */
async function sizes(page: any) {
  return page.locator('.histoire-canvas-frame').evaluateAll((frames: HTMLElement[]) => frames.map((frame) => {
    const content = frame.querySelector<HTMLElement>('.histoire-frame-content')!
    const iframe = content.querySelector('iframe')!
    return { title: frame.querySelector('.histoire-frame-title')?.textContent, width: Number.parseFloat(content.style.width), height: Number.parseFloat(content.style.height), viewport: iframe ? [iframe.clientWidth, iframe.clientHeight] : null }
  }))
}

/** Select through actual toolbar; no injected preference can replace menu wiring proof. */
async function autoFit(page: any) {
  await page.getByRole('button', { name: 'Viewport', exact: true }).click()
  await page.getByRole('button', { name: 'Auto fit content', exact: true }).click()
}

describe('content-sized workbench browser acceptance', () => {
  it('fits distinct variants, tracks growth/shrink without remounting, and retains mode across layouts/reload', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'source-dev', embedding: false, story, config: 'routerMode:"hash",ui:{frameBudget:8},vite:{server:{watch:{ignored:["**/packages/histoire*/**"]}}},' })
    const page = await fixture.browser.newPage({ viewport: { width: 1920, height: 1080 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await linkEmbedFixturePlaywright(fixture.root)
      await page.goto(`${fixture.bookUrl}#/story/content?variantId=first&arrange=grid`)
      await autoFit(page)
      const expected = [
        { title: 'First', width: 120, height: 60, viewport: [120, 60] },
        { title: 'Second', width: 200, height: 90, viewport: [200, 90] },
        { title: 'Empty', width: 1, height: 1, viewport: [1, 1] },
      ]
      await expect.poll(() => sizes(page), { timeout: 30_000 }).toEqual(expected)
      const first = page.locator('.histoire-canvas-frame').filter({ has: page.getByRole('button', { name: 'First', exact: true }) })
      const iframe = first.locator('iframe')
      const runtime = await (await iframe.elementHandle())!.contentFrame()
      const documentId = await runtime!.evaluate(() => (window as any).__HST_PREVIEW_DOCUMENT_ID__)
      await runtime!.getByRole('button', { name: 'Count 0', exact: true }).click()
      await runtime!.getByRole('button', { name: 'Toggle size', exact: true }).click()
      await expect.poll(() => sizes(page)).toEqual([{ ...expected[0], width: 240, height: 150, viewport: [240, 150] }, ...expected.slice(1)])
      await runtime!.getByRole('button', { name: 'Toggle size', exact: true }).click()
      await expect.poll(() => sizes(page)).toEqual(expected)
      expect(await runtime!.getByRole('button', { name: 'Count 1', exact: true }).count()).toBe(1)
      expect(await runtime!.evaluate(() => (window as any).__HST_PREVIEW_DOCUMENT_ID__)).toBe(documentId)
      await page.screenshot({ path: '/tmp/histoire-content-grid.png' })

      await page.getByRole('button', { name: 'List', exact: true }).click()
      await page.getByRole('button', { name: 'Zoom level', exact: true }).click()
      await page.getByRole('button', { name: /^Fit to canvas/ }).click()
      await expect.poll(() => sizes(page)).toEqual(expected)
      await page.getByRole('button', { name: 'Single variant', exact: true }).click()
      await expect.poll(() => sizes(page)).toEqual([{ ...expected[0], title: undefined }])
      await page.getByRole('button', { name: 'Zoom level', exact: true }).click()
      await page.getByRole('button', { name: '50%', exact: true }).click()
      await expect.poll(() => sizes(page)).toEqual([{ ...expected[0], title: undefined }])
      await page.reload()
      await expect.poll(() => sizes(page), { timeout: 30_000 }).toEqual([{ ...expected[0], title: undefined }])
      expect(await page.getByRole('button', { name: 'Viewport', exact: true }).textContent()).toContain('Auto fit')

      await page.getByRole('button', { name: 'Screenshot', exact: true }).click()
      await page.getByRole('button', { name: 'Check setup', exact: true }).click()
      await page.getByRole('button', { name: 'Capture 1 frame', exact: true }).click()
      await expect.poll(() => page.locator('.recent-capture img').first().evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]), { timeout: 30_000 }).toEqual([120, 60])
      await page.getByRole('button', { name: 'Screenshot', exact: true }).click()

      await page.getByRole('separator', { name: 'Resize viewport width', exact: true }).press('ArrowRight')
      await expect.poll(() => sizes(page)).toEqual([{ title: undefined, width: 128, height: 60, viewport: [128, 60] }])
      await autoFit(page)
      await expect.poll(() => sizes(page)).toEqual([{ ...expected[0], title: undefined }])

      await page.getByRole('button', { name: 'Rotate viewport', exact: true }).click()
      await expect.poll(() => sizes(page)).toEqual([{ title: undefined, width: 60, height: 120, viewport: [60, 120] }])
      await autoFit(page)
      await expect.poll(() => sizes(page)).toEqual([{ ...expected[0], title: undefined }])
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      await page.getByRole('textbox', { name: 'Custom width', exact: true }).fill('0')
      await page.getByRole('textbox', { name: 'Custom width', exact: true }).press('Enter')
      expect(await page.getByRole('button', { name: 'Auto fit content', exact: true }).getAttribute('aria-pressed')).toBe('true')
      await page.getByRole('textbox', { name: 'Custom width', exact: true }).fill('320')
      await page.getByRole('textbox', { name: 'Custom height', exact: true }).fill('180')
      await page.getByRole('textbox', { name: 'Custom height', exact: true }).press('Enter')
      await expect.poll(() => sizes(page)).toEqual([{ title: undefined, width: 320, height: 180, viewport: [320, 180] }])
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      await autoFit(page)
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      await page.getByRole('button', { name: /^Fill viewport/ }).click()
      await expect.poll(async () => (await sizes(page))[0].width).toBeGreaterThan(320)
      expect(await page.getByRole('button', { name: 'Viewport', exact: true }).textContent()).not.toContain('Auto fit')
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  }, 120_000)

  it('retains measured state within frame budget, rejects evicted documents, and updates after source HMR', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'source-dev', embedding: false, story, config: 'routerMode:"hash",ui:{frameBudget:1},vite:{server:{watch:{ignored:["**/packages/histoire*/**"]}}},' })
    const page = await fixture.browser.newPage({ viewport: { width: 1920, height: 1080 } })
    try {
      await page.goto(`${fixture.bookUrl}#/story/content?variantId=first&arrange=grid`)
      await autoFit(page)
      const first = page.locator('.histoire-canvas-frame').filter({ has: page.getByRole('button', { name: 'First', exact: true }) })
      const second = page.locator('.histoire-canvas-frame').filter({ has: page.getByRole('button', { name: 'Second', exact: true }) })
      const firstRuntime = await (await first.locator('iframe').elementHandle())!.contentFrame()
      await firstRuntime!.getByRole('button', { name: 'Toggle size', exact: true }).click()
      await expect.poll(async () => (await sizes(page))[0].width).toBe(240)
      await page.evaluate(() => {
        ;(window as any).retiredContentDocument = document.querySelector<HTMLIFrameElement>('.histoire-canvas-frame.is-selected iframe')?.contentDocument
      })
      await second.getByRole('button', { name: 'Second', exact: true }).click()
      await expect.poll(() => first.locator('iframe').count()).toBe(0)
      await expect.poll(() => page.locator('.histoire-canvas-frame iframe').count()).toBe(1)
      await expect.poll(() => second.locator('iframe').evaluate((frame: HTMLIFrameElement) => [frame.clientWidth, frame.clientHeight])).toEqual([200, 90])
      await page.evaluate('retiredContentDocument.querySelector("[data-box]").style.cssText="width:900px;height:900px"')
      await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      expect((await sizes(page))[0].width).toBe(240)
      await first.getByRole('button', { name: 'First', exact: true }).click()
      await expect.poll(() => first.locator('iframe').evaluate((frame: HTMLIFrameElement) => [frame.clientWidth, frame.clientHeight])).toEqual([240, 150])
      await second.getByRole('button', { name: 'Second', exact: true }).click()
      await expect.poll(() => second.locator('iframe').evaluate((frame: HTMLIFrameElement) => [frame.clientWidth, frame.clientHeight])).toEqual([200, 90])
      await second.locator('.histoire-frame-content[aria-busy="false"]').waitFor()
      await writeFile(join(fixture.root, 'Book.story.vue'), story.replace('width:200px;height:90px', 'width:210px;height:95px'))
      await expect.poll(() => second.locator('iframe').evaluateAll((frames: HTMLIFrameElement[]) => frames.map(frame => [frame.clientWidth, frame.clientHeight])), { timeout: 30_000 }).toEqual([[210, 95]])
      expect(await page.locator('.histoire-canvas-frame iframe').count()).toBe(1)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  }, 120_000)

  it('fits each Matrix projection and rotates using locally selected cell dimensions', async () => {
    const fixture = await createEmbedBridgeFixture({
      mode: 'source-dev',
      embedding: false,
      story: '<script setup>import Box from "./Box.vue"</script><template><Story id="matrix"><Variant id="one"><Box /></Variant></Story></template>',
      files: { 'Box.vue': '<script setup>defineProps({wide:Boolean,tall:Boolean})</script><template><div data-cell-box :style="{width:(wide?240:100)+\'px\',height:(tall?160:50)+\'px\'}">{{wide}} / {{tall}}</div></template>' },
      config: 'routerMode:"hash",ui:{frameBudget:8},vite:{server:{watch:{ignored:["**/packages/histoire*/**"]}}},',
    })
    const page = await fixture.browser.newPage({ viewport: { width: 1920, height: 1080 } })
    try {
      await page.goto(`${fixture.bookUrl}#/story/matrix?variantId=one&arrange=matrix&rows=wide&cols=tall`)
      await autoFit(page)
      const cells = page.locator('.histoire-matrix-cell')
      const dimensions = () => cells.evaluateAll((cells: HTMLElement[]) => cells.map((cell) => {
        const content = cell.querySelector<HTMLElement>('.histoire-matrix-cell-content')!
        const iframe = content.querySelector('iframe')!
        return [Number.parseFloat(content.style.width), Number.parseFloat(content.style.height), iframe?.clientWidth, iframe?.clientHeight]
      }))
      await expect.poll(dimensions, { timeout: 30_000 }).toEqual([[100, 50, 100, 50], [100, 160, 100, 160], [240, 50, 240, 50], [240, 160, 240, 160]])
      const geometry = await cells.evaluateAll((cells: HTMLElement[]) => cells.map(cell => cell.getBoundingClientRect().toJSON()))
      expect(geometry[0].right).toBeLessThan(geometry[1].left)
      expect(geometry[1].bottom).toBeLessThan(geometry[3].top)
      await page.screenshot({ path: '/tmp/histoire-content-matrix.png' })
      await cells.nth(1).getByRole('button', { name: /^Select matrix cell / }).click()
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      expect(await page.getByRole('textbox', { name: 'Custom width', exact: true }).inputValue()).toBe('100')
      expect(await page.getByRole('textbox', { name: 'Custom height', exact: true }).inputValue()).toBe('160')
      await page.getByRole('button', { name: 'Viewport', exact: true }).click()
      await page.getByRole('button', { name: 'Rotate viewport', exact: true }).click()
      await expect.poll(dimensions).toEqual(Array.from({ length: 4 }, () => [160, 100, 160, 100]))
      await autoFit(page)
      await expect.poll(dimensions).toEqual([[100, 50, 100, 50], [100, 160, 100, 160], [240, 50, 240, 50], [240, 160, 240, 160]])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  }, 120_000)
})
