import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { createEmbedVueHostAssets } from '../../utils/embed/vue-host.js'

const story = '<script setup>import AsyncChild from "./AsyncChild.vue"</script><template><Story id="async-owner"><Variant id="first"><AsyncChild/></Variant></Story></template>'
const child = `<script setup>
import {ref} from 'vue'
const count = ref(0)
if (!__HST_COLLECT__) await new Promise(resolve => { window.__RELEASE_ASYNC_CHILD__ = resolve })
</script><template><button @click="count++">Async child ready</button><output>{{count}}</output></template>`

describe('actual Vue Suspense readiness', () => {
  it('keeps primary pending until async child resolves, then publishes ready rendered owner', async () => {
    const fixture = await createEmbedBridgeFixture({ story, files: { 'AsyncChild.vue': child } })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{
        const {createHistoireSession}=await import('/sdk.js');
        window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});
        await session.connect();
        await session.selection.select({storyId:'async-owner',variantId:'first'});
        window.primary=session.mount(document.querySelector('#mount'),{surface:'preview'});
        window.readyState='pending';
        primary.ready.then(()=>window.readyState='ready',error=>window.readyState=error.code);
      })()`)
      const sandbox = () => page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      await expect.poll(async () => sandbox() && sandbox().evaluate('typeof window.__RELEASE_ASYNC_CHILD__')).toBe('function')
      expect(await page.evaluate('window.readyState')).toBe('pending')
      await sandbox().evaluate('window.__RELEASE_ASYNC_CHILD__()')
      await expect.poll(() => page.evaluate('window.readyState')).toBe('ready')
      expect(await sandbox().getByRole('button', { name: 'Async child ready' }).count()).toBe(1)
      await page.evaluate('session.dispose()')
      expect(await page.locator('iframe').count()).toBe(0)
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('restores native input after docs retires an initially pending runtime', async () => {
    const fixture = await createEmbedBridgeFixture({ story, hostModules: await createEmbedVueHostAssets(), files: { 'AsyncChild.vue': child, 'Guide.story.md': '# Guide' } })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    /** Identify current story canvas, excluding controls replicas. */
    function sandbox() {
      return page.frames().find(frame => frame.url().includes('__sandbox.html') && !frame.url().includes('controls=true'))
    }
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{
        const {createHistoireSession,createApp,h,HistoireProvider,HistoirePreview}=await import('/native.js');
        window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});
        await session.connect();await session.selection.select({storyId:'async-owner',variantId:'first'});
        window.nativeErrors=[];
        window.app=createApp({render:()=>h(HistoireProvider,{session,onError:error=>nativeErrors.push(error.code)},{default:()=>h(HistoirePreview)})});app.mount('#mount');
      })()`)
      await expect.poll(async () => sandbox() && sandbox()!.evaluate('typeof window.__RELEASE_ASYNC_CHILD__'), { timeout: 15_000 }).toBe('function')
      await page.evaluate('(async()=>{const docs=(await session.catalog.list()).find(story=>story.docsOnly);await session.selection.select({storyId:docs.id})})()')
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.status')).toBe('absent')
      await page.evaluate('void (window.selecting=session.selection.select({storyId:"async-owner",variantId:"first"}))')
      await expect.poll(async () => sandbox() && sandbox()!.evaluate('typeof window.__RELEASE_ASYNC_CHILD__'), { timeout: 15_000 }).toBe('function')
      await sandbox()!.evaluate('window.__RELEASE_ASYNC_CHILD__()')
      await page.evaluate('window.selecting')
      await sandbox()!.getByRole('button', { name: 'Async child ready', exact: true }).click({ timeout: 15_000 })
      expect(await sandbox()!.locator('output').textContent()).toBe('1')
      expect(await page.locator('#mount [role="alert"]').count()).toBe(0)
      expect(await page.evaluate('window.nativeErrors')).toEqual([])
      expect(errors).toEqual([])
      await page.evaluate('app.unmount();session.dispose()')
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
