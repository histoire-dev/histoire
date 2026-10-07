import { expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { STANDALONE_SELECTED_FRAME } from '../../utils/embed/browser.js'

it('blocks real grid actor input until that exact actor becomes ready', async () => {
  const fixture = await createEmbedBridgeFixture({ embedding: false, config: 'routerMode:"hash",', story: '<script setup>import{ref}from"vue";const count=ref(0)</script><template><Story id="grid" title="Grid" :layout="{type:\'grid\'}"><Variant id="one" title="First"><button>First actor</button></Variant><Variant id="two" title="Second"><button>Second actor</button></Variant><Variant id="three" title="Third"><button @click="count++">Third actor:{{count}}</button></Variant></Story></template>' })
  const page = await fixture.browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.addInitScript(() => {
      const schedule = window.requestAnimationFrame.bind(window)
      const callbacks: (() => void)[] = []
      let released = false
      // Hold only third actor's readiness so input admission has a deterministic
      // before/after boundary independent of browser or fixture build speed.
      ;(window as any).__RELEASE_READY__ = () => {
        released = true
        callbacks.splice(0).forEach(callback => callback())
      }
      window.requestAnimationFrame = callback => schedule((time) => {
        if (!released && location.pathname.endsWith('__sandbox.html') && location.search.includes('variantId=three')) callbacks.push(() => callback(time))
        else callback(time)
      })
    })
    await page.goto(`${fixture.bookUrl}#story/grid?variantId=one`)
    await page.locator(STANDALONE_SELECTED_FRAME).waitFor()
    const thirdFrame = page.locator('.histoire-canvas-frame').filter({ has: page.getByRole('button', { name: 'Third', exact: true }) })
    const content = thirdFrame.locator('.histoire-frame-content')
    expect(await content.getAttribute('aria-busy')).toBe('true')
    expect(await content.getAttribute('inert')).not.toBeNull()
    const actor = thirdFrame.frameLocator('iframe[title="Histoire variant"]').locator('[data-test-id="sandbox-render"]').getByRole('button', { name: /^Third actor:/ })
    // Native input into an inert iframe cannot activate a loading actor. Labels
    // can select a loading card without granting its document interaction.
    await actor.click()
    expect(await actor.textContent()).toBe('Third actor:0')
    const iframe = await thirdFrame.locator('iframe[title="Histoire variant"]').elementHandle()
    const runtime = (await iframe?.contentFrame())!
    await runtime.evaluate(() => (window as any).__RELEASE_READY__())
    await expect.poll(() => content.getAttribute('aria-busy')).toBe('false')
    await actor.click()
    await expect.poll(() => actor.textContent()).toBe('Third actor:1')
    await expect.poll(() => new URL(page.url().replace('#', '')).searchParams.get('variantId')).toBe('three')
    expect(errors).toEqual([])
  }
  finally {
    await page.close()
    await fixture.close()
  }
})
