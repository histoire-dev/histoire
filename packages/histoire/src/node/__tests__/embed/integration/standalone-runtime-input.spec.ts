import { expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

it('admits real grid pointer selection only after that exact actor becomes ready', async () => {
  const fixture = await createEmbedBridgeFixture({ embedding: false, config: 'routerMode:"hash",', story: '<template><Story id="grid" title="Grid" :layout="{type:\'grid\'}"><Variant id="one" title="First"><button>First actor</button></Variant><Variant id="two" title="Second"><button>Second actor</button></Variant><Variant id="three" title="Third"><button>Third actor</button></Variant></Story></template>' })
  const page = await fixture.browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.addInitScript(() => {
      const trace: { type: string, variantId: string, time: number }[] = []
      Object.assign(window, { gridInputTrace: trace })
      window.addEventListener('message', (event) => {
        if (event.data?.__histoire && ['__histoire:variant-ready', '__histoire:select-variant'].includes(event.data.type)) {
          trace.push({ type: event.data.type, variantId: event.data.variantId, time: performance.now() })
        }
      })
      const schedule = window.requestAnimationFrame.bind(window)
      let callbacks = 0
      // Each real actor can finish after its sibling; rendering a card does not
      // admit its state, selection or channel traffic into the owning wrapper.
      window.requestAnimationFrame = callback => schedule((time) => {
        if (location.pathname.endsWith('__sandbox.html') && location.search.includes('grid=true')) setTimeout(() => callback(time), 200 * ++callbacks)
        else callback(time)
      })
    })
    await page.goto(`${fixture.bookUrl}#story/grid?variantId=one`)
    await page.waitForFunction(() => document.querySelector('.histoire-primary-frame')?.getAttribute('aria-busy') === 'false')
    const third = page.frameLocator('iframe[title="Histoire preview"]').getByRole('button', { name: 'Third', exact: true })
    expect(await third.isEnabled()).toBe(false)
    await third.click()
    await expect.poll(() => new URL(page.url().replace('#', '')).searchParams.get('variantId')).toBe('three')
    const trace = await page.evaluate('gridInputTrace') as { type: string, variantId: string, time: number }[]
    const ready = trace.find(value => value.type === '__histoire:variant-ready' && value.variantId === 'three')!
    const selected = trace.find(value => value.type === '__histoire:select-variant' && value.variantId === 'three')!
    expect(selected.time).toBeGreaterThanOrEqual(ready.time)
    expect(errors).toEqual([])
  }
  finally {
    await page.close()
    await fixture.close()
  }
})
