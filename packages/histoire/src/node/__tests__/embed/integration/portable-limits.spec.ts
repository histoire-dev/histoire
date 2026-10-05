import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const story = `<template><Story id="large" title="Large catalog">
<Variant v-for="index in 600" :key="index" :id="'variant-'+index" :title="'Variant '+index+' '+ 'x'.repeat(1800)" :init-state="()=>({count:1})">
<template #default="{state}"><button @click="state.count++">Count {{state.count}}</button></template>
</Variant></Story></template>`

describe('portable wire budgets across real parent gates', () => {
  it('accepts catalog above generic response limit and preserves cyclic state across owned runtime', async () => {
    const fixture = await createEmbedBridgeFixture({ story, copiedOutput: true })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{
        const {createHistoireSession}=await import('/sdk.js');
        window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});
        await session.connect();
      })()`)
      const catalog = await page.evaluate('session.catalog.list()')
      expect(Buffer.byteLength(JSON.stringify(catalog))).toBeGreaterThan(1024 * 1024)
      expect(catalog.find(entry => entry.id === 'large').variants).toHaveLength(600)
      expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
      await page.evaluate(`(async()=>{
        await session.selection.select({storyId:'large',variantId:'variant-1'});
        window.primary=session.mount(document.querySelector('#mount'),{surface:'preview'});
        await primary.ready;
        const cyclic={label:'cycle'};
        cyclic.self=cyclic;
        await session.state.patch({count:7,cyclic});
      })()`)
      const state = await page.evaluate(`(async()=>{
        const state=await session.state.get();
        return {count:state.value.count,label:state.value.cyclic.label,cycle:state.value.cyclic.self===state.value.cyclic,
          mirror:session.getSnapshot().state.value.cyclic.self===session.getSnapshot().state.value.cyclic};
      })()`)
      expect(state).toEqual({ count: 7, label: 'cycle', cycle: true, mirror: true })
      const sandbox = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      await expect.poll(() => sandbox.getByRole('button').textContent()).toBe('Count 7')
      await page.evaluate('session.dispose()')
      expect(await page.locator('iframe').count()).toBe(0)
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
