import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { createEmbedVueHostAssets } from '../../utils/embed/vue-host.js'

const story = `<script>import{onTest}from'histoire/client';import{it,expect}from'vitest';onTest(({canvas})=>it('owned assertion',async()=>{if(canvas.textContent.includes('slow'))await new Promise(resolve=>setTimeout(resolve,5000));expect(canvas.textContent).toContain('pass')}))</script><template><Story id="tests"><Variant id="pass"><button>pass</button></Variant><Variant id="fail"><button>fail</button></Variant><Variant id="slow"><button>slow pass</button></Variant></Story></template>`
const hostHtml = '<!doctype html><head><link rel="stylesheet" href="/native.css"></head><body><div id="mount" style="width:600px;height:400px"></div><div id="native"></div></body>'

describe('independent test surfaces', () => {
  it('keeps cross-origin server tests denied by default before engine admission', async () => {
    const fixture = await createEmbedBridgeFixture({ story, mode: 'dev' })
    const page = await fixture.browser.newPage()
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const result = await page.evaluate(`(async()=>{const{createHistoireSession}=await import('/sdk.js');const session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();await session.selection.select({storyId:'tests',variantId:'pass'});const available=session.getSnapshot().capabilities.serverTests.available;let code;try{await session.tests.run({mode:'server'})}catch(error){code=error.code}await session.dispose();return{available,code}})()`)
      expect(result).toEqual({ available: false, code: 'CAPABILITY_UNAVAILABLE' })
      expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('runs explicit allowed server engine from native and iframe panels without primary runtime', async () => {
    const fixture = await createEmbedBridgeFixture({ story, mode: 'dev', allowServerTests: true, hostHtml, hostModules: await createEmbedVueHostAssets() })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    const diagnostics: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(message.text())
    })
    page.on('requestfailed', request => diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{
        const{createHistoireSession}=await import('/sdk.js');const{createApp,h,HistoireProvider,HistoireTests}=await import('/native.js');
        window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();await session.selection.select({storyId:'tests',variantId:'fail'});
        window.panel=session.mount(document.querySelector('#mount'),{surface:'tests'});await panel.ready;
        window.app=createApp({render:()=>h(HistoireProvider,{session},{default:()=>h(HistoireTests)})});app.mount('#native');
      })()`)
      const iframe = page.frames().find(frame => frame.url().includes('surface=tests'))!
      expect(iframe).toBeTruthy()
      await expect.poll(() => iframe.getByLabel('Histoire tests').getByRole('status').textContent()).toBe('idle')
      expect(await page.evaluate('session.getSnapshot().runtime.status')).toBe('absent')
      expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
      expect(await iframe.getByRole('button', { name: 'Run preview', exact: true }).isEnabled()).toBe(false)
      await iframe.getByRole('button', { name: 'Run server', exact: true }).click()
      await expect.poll(() => iframe.getByRole('status').textContent(), { timeout: 60_000 }).toContain('1 failed')
      expect(await page.locator('#native').getByRole('status').textContent()).toBe('idle')
      await page.evaluate('session.selection.select({storyId:"tests",variantId:"pass"})')
      await page.locator('#native').getByRole('button', { name: 'Run server', exact: true }).click()
      await expect.poll(() => page.locator('#native').getByRole('status').textContent(), { timeout: 60_000 }).toContain('1 passed')
      expect(await page.evaluate('session.getSnapshot().runtime.status')).toBe('absent')
      await page.evaluate('session.selection.select({storyId:"tests",variantId:"slow"})')
      await iframe.getByRole('button', { name: 'Run server', exact: true }).click()
      await page.waitForTimeout(250)
      await iframe.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect.poll(() => iframe.getByRole('status').textContent()).toBe('cancelled')
      await page.evaluate('session.selection.select({storyId:"tests",variantId:"pass"})')
      expect(await page.evaluate('session.tests.run({mode:"server"})')).toMatchObject({ ok: true, passed: 1 })
      await page.screenshot({ path: '/tmp/histoire-sdk-tests-surfaces.png', fullPage: true })
      await page.evaluate('app.unmount();panel.unmount();session.dispose()')
      expect(errors).toEqual([])
    }
    catch (error) {
      throw new Error(`${String(error)}\n${diagnostics.join('\n')}`, { cause: error })
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
