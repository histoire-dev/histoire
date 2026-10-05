import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { probeEmbedHandshake } from '../../utils/embed/handshake.js'

describe('real iframe bridge origins', () => {
  it('reads same-origin and allowed cross-origin books; denies unlisted origin without story execution', async () => {
    const fixture = await createEmbedBridgeFixture()
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      const catalogs: unknown[] = []
      for (const origin of [fixture.bookOrigin, fixture.hostOrigin]) {
        await page.goto(`${origin}/host.html`)
        const result = await page.evaluate(`(async () => {
          const { createHistoireSession } = await import('/sdk.js')
          const session = createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}})
          await session.connect()
          const catalog = await session.catalog.list()
          const docs = await session.docs.get(catalog[0].id)
          const search = await session.catalog.search('Bridge')
          const snapshot = session.getSnapshot()
          const result = {catalog,docs:docs.body,search,serverTests:snapshot.capabilities.serverTests,openInEditor:snapshot.capabilities.openInEditor}
          await session.dispose()
          return result
        })()`)
        catalogs.push(result.catalog)
        expect(result.docs).toContain('Bridge book documentation')
        expect(result.search.length).toBeGreaterThan(0)
        expect(result.serverTests.available).toBe(false)
        expect(await page.locator('iframe').count()).toBe(0)
      }
      expect(catalogs[0]).toEqual(catalogs[1])
      await page.goto(`${fixture.deniedOrigin}/host.html`)
      const denied = await page.evaluate(`(async () => {
        const {createHistoireSession} = await import('/sdk.js')
        const session = createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}})
        try { await session.connect(); return 'accepted' }
        catch (error) { return error.code }
        finally { await session.dispose() }
      })()`)
      expect(denied).toBe('ORIGIN_DENIED')
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const oldProtocol = await probeEmbedHandshake(page, { bookUrl: fixture.bookUrl, range: { min: 1, max: 2 } })
      expect(oldProtocol.owner.protocolVersion).toBe(1)
      const incompatible = await probeEmbedHandshake(page, { bookUrl: fixture.bookUrl, range: { min: 3, max: 3 } })
      expect(incompatible.error).toMatchObject({ code: 'PROTOCOL_MISMATCH', message: 'Host protocol 3–3; book protocol 1–1' })
      expect((await probeEmbedHandshake(page, { bookUrl: fixture.bookUrl, hintMismatch: true })).error.code).toBe('ORIGIN_DENIED')
      expect(await probeEmbedHandshake(page, { bookUrl: fixture.bookUrl, ports: 0 })).toEqual({ silent: true })
      expect(await probeEmbedHandshake(page, { bookUrl: fixture.bookUrl, ports: 2 })).toEqual({ silent: true })
      expect(await probeEmbedHandshake(page, { bookUrl: fixture.bookUrl, wrongSource: true })).toEqual({ silent: true })
      const unavailable = Object.entries(oldProtocol.descriptor.capabilities.surfaces).find(([, capability]) => !(capability as { available: boolean }).available)
      if (unavailable) expect((await probeEmbedHandshake(page, { bookUrl: fixture.bookUrl, surface: unavailable[0] })).error.code).toBe('CAPABILITY_UNAVAILABLE')
      await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await window.session.connect()})()`)
      const frame = page.frames().find(frame => frame.url().includes('__embed.html'))!
      expect(await frame.evaluate(() => ({ imports: (window as any).__SOURCE_IMPORTS__, frames: window.frames.length, app: !!document.querySelector('#app') }))).toEqual({ imports: undefined, frames: 0, app: false })
      expect(errors).toEqual([])
      // Exact fixture origins are logged once for acceptance evidence.
      process.stdout.write(`Embed origins: book=${fixture.bookOrigin} allowed=${fixture.hostOrigin} denied=${fixture.deniedOrigin}; browser=${process.env.HISTOIRE_EMBED_BROWSER ?? 'chromium'}\n`)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
