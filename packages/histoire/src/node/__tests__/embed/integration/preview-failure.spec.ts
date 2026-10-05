import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { attemptEmbedPrimary } from '../../utils/embed/primary-session.js'

describe('failed primary runtime lifecycle', () => {
  it('publishes setup failure promptly, retains slot until teardown and mounts replacement afterward', async () => {
    const fixture = await createEmbedBridgeFixture({
      story: '<template><Story id="failure"><Variant id="fail" :meta="{fail:true}"><button>Failed</button></Variant><Variant id="good"><button>Replacement</button></Variant></Story></template>',
      setup: 'export function setupVue3({variant}){if(variant?.meta?.fail)throw new Error("intentional setup failure")}',
    })
    const page = await fixture.browser.newPage()
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const start = performance.now()
      const result = await attemptEmbedPrimary(page, fixture.bookUrl, { storyId: 'failure', variantId: 'fail' }, 'preview')
      expect(result?.code).toBe('PREVIEW_NOT_READY')
      expect(performance.now() - start).toBeLessThan(15_000)
      expect(await page.evaluate('session.getSnapshot().runtime.status')).toBe('failed')
      expect(await page.evaluate('(()=>{try{session.mount(document.querySelector("#mount"),{surface:"preview"});return null}catch(error){return error.code}})()')).toBe('RUNTIME_IN_USE')
      await page.evaluate('primary.unmount()')
      await page.evaluate('session.selection.select({storyId:"failure",variantId:"good"})')
      await page.evaluate('window.primary=session.mount(document.querySelector("#mount"),{surface:"preview"});primary.ready')
      const sandbox = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      expect(await sandbox.getByRole('button').textContent()).toBe('Replacement')
      await page.evaluate('session.dispose()')
      expect(await page.locator('iframe').count()).toBe(0)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
