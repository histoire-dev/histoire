import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { chooseHistoireSelectOption } from '../../utils/embed/controls.js'
import { createEmbedVueHostAssets } from '../../utils/embed/vue-host.js'

const hostHtml = '<!doctype html><html><head><title>Host title</title><style>body{margin:20px;color:navy;background:lavender}#first,#second{height:600px;width:1100px}#host-field{border:3px solid orange}</style></head><body><input id="host-field" value="host"><div id="first"></div><div id="second"></div></body></html>'
const story = '<script>if(typeof window!==\'undefined\')window.__HOST_STORY_IMPORTS__=true</script><script setup>const initial=()=>({count:2,enabled:true})</script><template><Story id="normal" title="Normal story"><Variant id="one" title="First" :init-state="initial"><template #default="{state}"><button @click="state.count++">Count:{{state.count}}</button></template></Variant><Variant id="two" title="Second"><button>Second</button></Variant></Story></template>'

describe('shared native and iframe Explorer', () => {
  it('starts empty, selects docs/stories, joins grid switches, preserves host and isolates HSL palettes', async () => {
    const fixture = await createEmbedBridgeFixture({ story, hostHtml, hostModules: await createEmbedVueHostAssets(), config: `theme:{colors:{primary:{500:'hsl(280 100% 50% / 80%)',600:'hsl(280 100% 50% / 80%)'}}},`, files: {
      'Book.story.md': '# Mixed story documentation\n\nMixed documentation needle',
      'Guide.story.md': '# Explorer guide',
      'Grid.story.vue': '<template><Story id="grid" title="Grid story" :layout="{type:\'grid\'}"><Variant id="first"><button>Grid first</button></Variant><Variant id="second"><button>Grid second</button></Variant></Story></template>',
    } })
    const page = await fixture.browser.newPage({ viewport: { width: 1400, height: 1400 } })
    const errors: string[] = []
    const diagnostics: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(message.text())
    })
    const primary = () => page.frames().filter(frame => frame.url().includes('__sandbox.html') && !frame.url().includes('controls=true'))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const hostBefore = await page.locator('#host-field').boundingBox()
      await page.evaluate(`(async()=>{
        const {createHistoireSession}=await import('/sdk.js');const {createApp,h,HistoireProvider,HistoireExplorer}=await import('/native.js');
        await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/native.css';link.onload=resolve;link.onerror=reject;document.head.append(link)});
        window.sessions=[createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}}),createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}})];await Promise.all(sessions.map(session=>session.connect()));
        window.outer=sessions[0].mount(document.querySelector('#first'),{surface:'explorer'});await outer.ready;
        window.nativeErrors=[];window.app=createApp({render:()=>h(HistoireProvider,{session:sessions[1],onError:error=>nativeErrors.push(error.code)},{default:()=>h(HistoireExplorer,{onError:error=>nativeErrors.push(error.code)})})});app.mount('#second');
      })()`)
      await expect.poll(() => page.locator('#second').getByRole('button', { name: 'Normal story', exact: true }).count(), { timeout: 15_000 }).toBe(1)
      expect(primary()).toHaveLength(0)
      expect(await page.evaluate('window.__HOST_STORY_IMPORTS__')).toBeUndefined()
      await page.evaluate('sessions[0].selection.select({storyId:"normal",variantId:"one"})')
      await expect.poll(() => primary().length, { timeout: 15_000 }).toBe(1)
      await page.evaluate('sessions[1].selection.select({storyId:"normal",variantId:"one"})')
      await expect.poll(() => primary().length, { timeout: 15_000 }).toBe(2)
      await page.locator('#second').getByRole('spinbutton', { name: 'count', exact: true }).fill('7')
      expect(await page.evaluate('sessions[1].state.get().then(state=>state.value.count)')).toBe(7)
      expect(await page.evaluate('sessions[0].state.get().then(state=>state.value.count)')).toBe(2)
      await page.locator('#second').getByRole('button', { name: 'Show variant grid' }).click()
      await expect.poll(() => page.evaluate('sessions[1].getSnapshot().runtime.layout'), { timeout: 15_000 }).toBe('grid')
      await page.evaluate('sessions[0].selection.select({storyId:"grid"})')
      await expect.poll(() => page.evaluate('sessions[0].getSnapshot().runtime.layout'), { timeout: 15_000 }).toBe('grid')
      const guide = await page.evaluate('sessions[0].catalog.list().then(stories=>stories.find(story=>story.docsOnly))')
      await page.evaluate(`sessions[0].selection.select({storyId:${JSON.stringify(guide.id)}})`)
      await expect.poll(() => primary().length, { timeout: 15_000 }).toBe(1)
      const explorer = page.frames().find(frame => frame.url().includes('surface=explorer'))!
      await expect.poll(() => explorer.getByLabel('Histoire documentation').textContent(), { timeout: 15_000 }).toContain('Explorer guide')
      await page.evaluate('sessions[0].selection.select({storyId:"normal",variantId:"one"})')
      await expect.poll(() => primary().length, { timeout: 15_000 }).toBe(2)
      const firstRuntime = primary().find(frame => frame.parentFrame()?.url().includes('surface=explorer'))!
      // Adaptive layout replacement follows original selection ACK; keyboard
      // authority belongs only to replacement document after real readiness.
      const documentId = new URL(firstRuntime.url()).searchParams.get('documentId')
      await expect.poll(() => page.evaluate('sessions[0].getSnapshot().runtime').then(runtime => ({ id: runtime.runtimeId, status: runtime.status })), { timeout: 15_000 }).toEqual({ id: documentId, status: 'ready' })
      await firstRuntime.getByRole('button', { name: 'Count:2' }).focus()
      await page.keyboard.press('Control+k')
      await expect.poll(() => explorer.getByRole('searchbox', { name: 'Search stories and docs' }).evaluate((element: HTMLElement) => element === element.ownerDocument.activeElement), { timeout: 15_000 }).toBe(true)
      const iframeSearch = explorer.getByRole('region', { name: 'Histoire search', exact: true })
      await explorer.getByRole('searchbox', { name: 'Search stories and docs' }).fill('Mixed documentation needle')
      await expect.poll(() => iframeSearch.locator('li button').count()).toBe(1)
      await iframeSearch.locator('li button').click()
      await expect.poll(() => explorer.getByRole('tab', { name: 'Docs', exact: true }).getAttribute('aria-selected')).toBe('true')
      await expect.poll(() => explorer.getByLabel('Histoire documentation').textContent()).toContain('Mixed story documentation')
      expect(await page.evaluate('sessions.map(session=>session.getSnapshot().selection)')).toEqual([
        { storyId: 'normal', variantId: null },
        { storyId: 'normal', variantId: 'one' },
      ])
      expect(await page.locator('#host-field').boundingBox()).toEqual(hostBefore)
      expect(new URL(page.url()).pathname).toBe('/host.html')
      expect(await page.title()).toBe('Host title')
      await page.screenshot({ path: '/tmp/histoire-sdk-14-explorers-hsl.png', fullPage: true })
      await page.locator('#second').evaluate((element: HTMLElement) => {
        element.style.width = '600px'
        element.style.height = '700px'
      })
      const nativeGrid = primary().find(frame => frame.parentFrame()?.url().includes('surface=grid'))!
      await nativeGrid.getByRole('button', { name: 'Count:2', exact: true }).click()
      expect(await page.evaluate('sessions[1].state.get().then(state=>state.value.count)')).toBe(3)
      const nativeDocument = await page.evaluate('sessions[1].getSnapshot().runtime.runtimeId')
      await chooseHistoireSelectOption(page.locator('#second'), page, 'Variant', 'Second')
      await expect.poll(() => page.evaluate('({variant:sessions[1].getSnapshot().selection.variantId,status:sessions[1].getSnapshot().runtime.status})')).toEqual({ variant: 'two', status: 'ready' })
      await chooseHistoireSelectOption(page.locator('#second'), page, 'Variant', 'First')
      await expect.poll(() => page.evaluate('({variant:sessions[1].getSnapshot().selection.variantId,status:sessions[1].getSnapshot().runtime.status})')).toEqual({ variant: 'one', status: 'ready' })
      expect(await page.evaluate('sessions[1].state.get().then(state=>state.value.count)')).toBe(3)
      expect(await page.evaluate('sessions[1].getSnapshot().runtime.runtimeId')).toBe(nativeDocument)
      await page.screenshot({ path: '/tmp/histoire-sdk-14-explorer-compact.png', fullPage: true })
      // Native search owns same docs intent; neighbor provider remains isolated.
      const native = page.locator('#second')
      const nativeSearch = native.getByRole('region', { name: 'Histoire search', exact: true })
      await native.getByRole('searchbox', { name: 'Search stories and docs' }).fill('Mixed documentation needle')
      await expect.poll(() => nativeSearch.locator('li button').count()).toBe(1)
      await nativeSearch.locator('li button').click()
      await expect.poll(() => native.getByRole('tab', { name: 'Docs', exact: true }).getAttribute('aria-selected')).toBe('true')
      await expect.poll(() => native.getByLabel('Histoire documentation').textContent()).toContain('Mixed story documentation')
      expect(await page.evaluate('sessions[0].getSnapshot().selection')).toEqual({ storyId: 'normal', variantId: null })
      expect(page.url()).toBe(`${fixture.hostOrigin}/host.html`)
      expect(await page.title()).toBe('Host title')
      await page.evaluate('outer.unmount();app.unmount()')
      await expect.poll(() => primary().length, { timeout: 15_000 }).toBe(0)
      expect(await page.evaluate('sessions.map(session=>session.getSnapshot().status)')).toEqual(['ready', 'ready'])
      await page.evaluate('sessions[0].selection.select({storyId:"grid"})')
      await page.evaluate('outer=sessions[0].mount(document.querySelector("#first"),{surface:"explorer"});outer.ready')
      await expect.poll(() => primary().length, { timeout: 15_000 }).toBe(1)
      expect(await page.evaluate('sessions[0].getSnapshot().runtime.layout')).toBe('grid')
      await page.evaluate('Promise.all(sessions.map(session=>session.dispose()))')
      await expect.poll(() => page.locator('iframe').count(), { timeout: 15_000 }).toBe(0)
      expect(await page.evaluate('nativeErrors')).toEqual([])
      expect(errors).toEqual([])
    }
    catch (error) {
      console.error('Explorer errors', errors)
      console.error('Explorer diagnostics', diagnostics)
      await page.screenshot({ path: '/tmp/histoire-sdk-14-explorers-failure.png', fullPage: true })
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
