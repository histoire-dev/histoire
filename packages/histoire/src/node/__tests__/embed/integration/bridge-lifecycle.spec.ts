import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

describe('real iframe bridge lifecycle', () => {
  it('rejects pending dispose, makes reconnect explicit, and refuses unavailable views', async () => {
    const fixture = await createEmbedBridgeFixture()
    const page = await fixture.browser.newPage()
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const cancelled = await page.evaluate(`(async()=>{
        const {createHistoireSession}=await import('/sdk.js')
        const session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}})
        const connection=session.connect().catch(error=>error.code)
        await session.dispose()
        return {code:await connection,frames:document.querySelectorAll('iframe').length,status:session.getSnapshot().status}
      })()`)
      expect(cancelled).toEqual({ code: 'DISPOSED', frames: 0, status: 'disposed' })
      await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await window.session.connect()})()`)
      const surface = await page.evaluate(`(async()=>{
        const available=window.session.getSnapshot().capabilities.surfaces.tree.available
        try {
          const mount=window.session.mount(document.querySelector('#mount'),{surface:'tree'})
          await mount.ready
          await mount.unmount()
          return {available,result:'ready'}
        } catch(error) { return {available,result:error.code} }
      })()`)
      expect(surface.result).toBe(surface.available ? 'ready' : 'CAPABILITY_UNAVAILABLE')
      expect(await page.locator('iframe').count()).toBe(1)
      await page.evaluate(() => {
        document.querySelector('iframe')!.src = 'about:blank'
      })
      await expect.poll(() => page.evaluate(() => (window as any).session.getSnapshot().status)).toBe('disconnected')
      expect(await page.locator('iframe').count()).toBe(0)
      await page.evaluate('window.session.connect()')
      expect(await page.evaluate(() => (window as any).session.getSnapshot().status)).toBe('ready')
      expect(await page.locator('iframe').count()).toBe(1)
      await page.evaluate('window.session.dispose()')
      expect(await page.locator('iframe').count()).toBe(0)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
