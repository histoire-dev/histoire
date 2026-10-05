import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { embedControlsHostHtml, embedControlsStory, embedCustomControlsFrame, mountEmbedControlsHost, waitEmbedControlsReady, warmEmbedControlsSource } from '../../utils/embed/controls-host.js'
import { createEmbedVueHostAssets } from '../../utils/embed/vue-host.js'

describe('controls provider lifecycle isolation', () => {
  it('keeps unavailable panels inert, generic edits canonical and stale replica work harmless', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', story: embedControlsStory, files: { 'greeting.ts': 'export const greeting=()=> "unmocked"' }, hostHtml: embedControlsHostHtml, hostModules: await createEmbedVueHostAssets() })
    const page = await fixture.browser.newPage({ viewport: { width: 1380, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await warmEmbedControlsSource(fixture.browser, fixture.bookUrl)
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await mountEmbedControlsHost(page, fixture.bookUrl)
      await Promise.all([waitEmbedControlsReady(page), waitEmbedControlsReady(page, 1)])
      await expect.poll(() => embedCustomControlsFrame(page)?.getByRole('button', { name: 'Choice', exact: true }).isVisible()).toBe(true)
      await expect.poll(() => embedCustomControlsFrame(page, 1)?.getByRole('button', { name: 'Choice', exact: true }).isVisible(), { timeout: 30_000 }).toBe(true)
      const frameCount = page.frames().filter(frame => frame.url().includes('__sandbox.html')).length
      await page.evaluate(`(async()=>{
        const {createApp,h,HistoireProvider,HistoireControls}=await import('/native.js'),{createHistoireSession}=await import('/sdk.js');
        const element=document.createElement('div');element.id='unavailable';document.body.append(element);
        window.unavailableSession=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await unavailableSession.connect();await unavailableSession.selection.select({storyId:'controls',variantId:'generic'});
        window.unavailableApp=createApp({render:()=>h(HistoireProvider,{session:unavailableSession},{default:()=>h(HistoireControls)})});unavailableApp.mount(element);
      })()`)
      expect(await page.locator('#unavailable').textContent()).toContain('Preview unavailable')
      expect(page.frames().filter(frame => frame.url().includes('__sandbox.html'))).toHaveLength(frameCount)
      const documentId = new URL(embedCustomControlsFrame(page).url()).searchParams.get('documentId')!
      const customMountId = await page.evaluate('controlsMounts[0].id') as string
      await embedCustomControlsFrame(page).getByRole('button', { name: 'Choice', exact: true }).click()
      await expect.poll(() => page.locator('#first [role=listbox]').isVisible()).toBe(true)
      await page.evaluate('sessions[0].selection.select({storyId:"controls",variantId:"generic"})')
      await expect.poll(() => page.locator('#first [role=listbox]').count()).toBe(0)
      const count = page.locator('#first').getByRole('spinbutton', { name: 'count', exact: true })
      await expect.poll(() => count.isVisible()).toBe(true)
      await count.fill('17')
      await expect.poll(() => page.evaluate('sessions[0].state.get().then(state=>state.value.count)')).toBe(17)
      await waitEmbedControlsReady(page, 0, customMountId)
      const replacement = () => embedCustomControlsFrame(page)
      await expect.poll(() => replacement()?.url().includes('variantId=generic')).toBe(true)
      await replacement().evaluate(oldId => parent.postMessage({ __histoire: true, documentId: oldId, storyId: 'controls', variantId: 'generic', type: '__histoire:state-sync', state: { count: 999 } }, location.origin), documentId)
      expect(await page.evaluate('sessions[0].state.get().then(state=>state.value.count)')).toBe(17)
      expect(await page.evaluate('sessions[1].state.get().then(state=>state.value.count)')).toBe(2)
      const genericMountId = await page.evaluate('controlsMounts[0].id') as string
      await page.evaluate('sessions[0].selection.select({storyId:"controls",variantId:"custom"})')
      await waitEmbedControlsReady(page, 0, genericMountId)
      await expect.poll(() => replacement()?.getByRole('button', { name: 'Choice', exact: true }).isVisible()).toBe(true)
      await replacement().getByRole('button', { name: 'Choice', exact: true }).click()
      await expect.poll(() => page.locator('#first [role=listbox]').isVisible()).toBe(true)
      await page.evaluate('apps[0].unmount()')
      await expect.poll(() => page.locator('#first iframe').count()).toBe(0)
      expect(await page.locator('#first [role=listbox]').count()).toBe(0)
      expect(await page.evaluate('sessions[0].getSnapshot().status')).toBe('ready')
      expect(await page.evaluate('sessions[1].state.get().then(state=>state.value.count)')).toBe(2)
      await page.screenshot({ path: '/tmp/histoire-sdk-10-provider-isolation.png', fullPage: true })
      await page.evaluate('apps[1].unmount();unavailableApp.unmount();Promise.all([...sessions,unavailableSession].map(session=>session.dispose()))')
      await expect.poll(() => page.locator('iframe').count()).toBe(0)
      expect(await page.evaluate('nativeErrors')).toEqual([])
      expect(errors).toEqual([])
    }
    catch (error) {
      console.error({ errors, nativeErrors: await page.evaluate('window.nativeErrors'), frames: page.frames().map(frame => frame.url()) })
      await page.screenshot({ path: '/tmp/histoire-sdk-10-isolation-failure.png', fullPage: true })
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
