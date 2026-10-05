import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const story = `<script lang="ts">
import {onTest} from 'histoire/client'
import {it,expect} from 'vitest'
onTest(({canvas})=>{
 it('renders exact target',()=>expect(canvas.textContent).toContain('pass'))
 it('slow owned test',async()=>{if(canvas.textContent.includes('slow'))await new Promise(resolve=>setTimeout(resolve,5000))})
})
</script><template><Story id="tests"><Variant id="pass"><button>pass</button></Variant><Variant id="fail"><button>fail</button></Variant><Variant id="slow"><button>slow pass</button></Variant></Story></template>`

describe('explicit embedded test execution', () => {
  it('collects and runs static preview once, rejects server mode, retires cancelled document', async () => {
    const fixture = await createEmbedBridgeFixture({ story })
    const page = await fixture.browser.newPage()
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{ const {createHistoireSession}=await import('/sdk.js'); window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}}); await session.connect(); await session.selection.select({storyId:'tests',variantId:'pass'}); window.primary=session.mount(document.querySelector('#mount'),{surface:'preview'}); await primary.ready })()`)
      const definitions = await page.evaluate('session.tests.collect()')
      expect(definitions.definitions).toHaveLength(2)
      const pass = await page.evaluate('session.tests.run({mode:"preview"})')
      expect(pass).toMatchObject({ ok: true, total: 2, passed: 2 })
      expect(pass.execution).toMatchObject({ mode: 'preview', target: { storyId: 'tests', variantId: 'pass' }, runtimeId: await page.evaluate('session.getSnapshot().runtime.runtimeId') })
      expect(pass.tests.every(test => test.storyId === 'tests' && test.variantId === 'pass')).toBe(true)
      expect(await page.evaluate('(async()=>{try{await session.tests.run({mode:"server"});return "unexpected"}catch(error){return error.code}})()')).toBe('CAPABILITY_UNAVAILABLE')
      await page.evaluate('session.selection.select({storyId:"tests",variantId:"fail"})')
      const fail = await page.evaluate('session.tests.run({mode:"preview"})')
      expect(fail).toMatchObject({ ok: false, failed: 1, total: 2 })
      await page.evaluate('session.selection.select({storyId:"tests",variantId:"slow"})')
      await page.evaluate('window.abort=new AbortController(); void(window.pending=session.tests.run({mode:"preview",signal:abort.signal}).then(()=>"unexpected",error=>error.code))')
      await page.waitForTimeout(250)
      await page.evaluate('abort.abort()')
      expect(await page.evaluate('pending')).toBe('CANCELLED')
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.status')).toBe('stale')
      expect(page.frames().some(frame => frame.url().includes('__sandbox.html'))).toBe(false)
      await page.evaluate('primary.unmount(); session.dispose()')
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
