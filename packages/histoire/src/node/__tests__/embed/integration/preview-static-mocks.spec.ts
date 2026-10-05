import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const story = `<script>import {vi} from 'vitest';import {greeting} from './greeting';vi.mock('./greeting',()=>({greeting:()=> 'Static mocked greeting'}))</script><script setup>const message=greeting()</script><template><Story id="static-mock"><Variant id="one" :init-state="()=>({count:4})"><template #default="{state}"><button @click="state.count++">{{message}}:{{state.count}}</button></template></Variant></Story></template>`

describe('static preview mock transport ownership', () => {
  it('starts mock service worker without awaiting its own registration and renders embedded/standalone story', async () => {
    const fixture = await createEmbedBridgeFixture({ story, config: 'storyCollectTimeout:8000,', files: { 'greeting.ts': 'export function greeting(){return "Real greeting"}' } })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();await session.selection.select({storyId:'static-mock',variantId:'one'});window.primary=session.mount(document.querySelector('#mount'),{surface:'preview'});await primary.ready})()`)
      const sandbox = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      expect(await sandbox.getByRole('button').textContent()).toBe('Static mocked greeting:4')
      await page.evaluate('session.state.patch({count:9})')
      await expect.poll(() => sandbox.getByRole('button').textContent()).toBe('Static mocked greeting:9')
      await page.evaluate('session.dispose()')
      await page.goto(new URL('__sandbox.html?storyId=static-mock&variantId=one', fixture.bookUrl).href)
      await page.getByRole('button', { name: 'Static mocked greeting:4', exact: true }).waitFor({ timeout: 8000 })
      expect(errors).toEqual([])
    }
    catch (error) {
      console.error('Static mock runtime errors:', errors)
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
