import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { chooseHistoireSelectOption } from '../../utils/embed/controls.js'
import { createEmbedVueHostAssets } from '../../utils/embed/vue-host.js'

const story = `<script setup>import {logEvent} from 'histoire/client';function send(event,label){void logEvent('dom',event);void logEvent('nested',{label,nested:{count:2}})}</script><script>if(typeof window!=='undefined')window.__SOURCE_IMPORTS__=(window.__SOURCE_IMPORTS__||0)+1</script><template><Story id="a:b" title="Widget"><Variant id="one:alpha" title="First"><button @click="send($event,'first')">Emit first</button></Variant><Variant id="two" title="Second"><button @click="send($event,'second')">Emit second</button></Variant></Story></template>`
const hostHtml = `<!doctype html><html><head><title>Host title</title><style>body{margin:20px;background:lavender;font:16px Georgia}#parts{display:flex;gap:12px}.host-book{width:430px;height:580px}.panels{display:flex;flex-direction:column;height:100%}.runtime{height:220px;flex:none}#event-frame{width:430px;height:220px}</style></head><body><div id="router"></div><input id="host-field" value="host value"><div id="parts"><div id="first" class="host-book"></div><div id="second" class="host-book"></div></div><div id="event-frame"></div></body></html>`

describe('independent native and iframe parts', () => {
  it('refreshes tree and same-query docs search after dev collection without executing browser stories', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', story, hostHtml, hostModules: await createEmbedVueHostAssets(), files: { 'Book.story.md': '# Widget docs\n\nNebula documentation.' } })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{
        const {createHistoireSession,createApp,h,HistoireProvider,HistoireStoryTree,HistoireSearch}=await import('/native.js');
        window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();
        window.app=createApp({render:()=>h(HistoireProvider,{session},{default:()=>[h(HistoireSearch),h(HistoireStoryTree)]})});app.mount('#first');
      })()`)
      const search = page.locator('#first .histoire-search')
      await search.getByRole('searchbox').fill('Nebula')
      await expect.poll(() => search.getByRole('button', { name: 'Widget', exact: true }).count()).toBe(1)
      const before = await page.evaluate('session.getSnapshot().source.revision')
      await writeFile(join(fixture.root, 'Book.story.md'), '# Widget docs\n\nAndromeda documentation.')
      await expect.poll(() => page.evaluate('session.getSnapshot().source.revision')).not.toBe(before)
      await expect.poll(() => search.locator('output').textContent()).toBe('No matches')
      await search.getByRole('searchbox').fill('Andromeda')
      await expect.poll(() => search.getByRole('button', { name: 'Widget', exact: true }).count()).toBe(1)
      await writeFile(join(fixture.root, 'Book.story.vue'), story.replace('title="Widget"', 'title="Updated widget"'))
      await expect.poll(() => page.locator('#first').getByRole('button', { name: 'Updated widget / First', exact: true }).count()).toBe(1)
      await expect.poll(() => search.getByRole('button', { name: 'Updated widget', exact: true }).count()).toBe(1)
      await search.getByRole('button', { name: 'Updated widget', exact: true }).click()
      expect(await page.evaluate('session.getSnapshot().selection')).toEqual({ storyId: 'a:b', variantId: null })
      expect(page.frames().some(frame => frame.url().includes('__sandbox'))).toBe(false)
      for (const frame of page.frames()) expect(await frame.evaluate('window.__SOURCE_IMPORTS__')).toBeUndefined()
      await page.evaluate('app.unmount();session.dispose()')
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('isolates host navigation/focus/settings and attributes single/grid events through retained iframe replay', async () => {
    const fixture = await createEmbedBridgeFixture({ story, hostHtml, hostModules: await createEmbedVueHostAssets(), files: { 'Book.story.md': '# Widget docs\n\nNebula documentation.' } })
    const page = await fixture.browser.newPage({ viewport: { width: 1280, height: 1000 } })
    const errors: string[] = []
    let stage = 'host initialization'
    page.on('pageerror', error => errors.push(`${stage}: ${error.stack ?? error.message}`))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{
        const link=document.createElement('link');link.rel='stylesheet';link.href='/native.css';document.head.append(link);
        const {createHistoireSession,createApp,h,ref,HistoireProvider,HistoireStoryTree,HistoireSearch,HistoireToolbar,HistoireEvents,HistoirePreview,HistoireVariantGrid,createRouter,createWebHistory,RouterLink,RouterView}=await import('/native.js');
        const router=createRouter({history:createWebHistory(),routes:[{path:'/host.html',component:{render:()=>h('p','Host home')}},{path:'/other',component:{render:()=>h('p','Host other')}}]});
        createApp({render:()=>h('div',[h(RouterLink,{to:'/other'},()=> 'Host navigation'),h(RouterView)])}).use(router).mount('#router');
        window.hostShortcuts=0;document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='k')hostShortcuts++});
        window.sessions=[];window.apps=[];window.received=[[],[]];window.shown=[ref(false),ref(false)];
        for(let index=0;index<2;index++){
          const session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();sessions.push(session);session.events.subscribe(event=>received[index].push(event));
          const app=createApp({render:()=>h(HistoireProvider,{session},{default:()=>h('div',{class:'panels'},[h('button','Focus '+index),h(HistoireToolbar),h(HistoireSearch),h(HistoireStoryTree),h(HistoireEvents),shown[index].value?h(index?HistoirePreview:HistoireVariantGrid,{class:'runtime'}):null])})});app.mount(index?'#second':'#first');apps.push(app);
        }
      })()`)
      await page.locator('#first').getByRole('button', { name: 'Widget / First', exact: true }).click()
      expect(await page.evaluate('sessions[0].getSnapshot().selection')).toEqual({ storyId: 'a:b', variantId: 'one:alpha' })
      expect(await page.evaluate('sessions[1].getSnapshot().selection')).toBeNull()
      await page.locator('#second').getByRole('searchbox').fill('Nebula')
      await page.locator('#second .histoire-search').getByRole('button', { name: 'Widget', exact: true }).click()
      expect(await page.evaluate('sessions[1].getSnapshot().selection')).toEqual({ storyId: 'a:b', variantId: null })
      expect(page.frames().some(frame => frame.url().includes('__sandbox'))).toBe(false)
      for (const frame of page.frames()) expect(await frame.evaluate('window.__SOURCE_IMPORTS__')).toBeUndefined()
      expect(await page.title()).toBe('Host title')
      expect(new URL(page.url()).pathname).toBe('/host.html')
      expect(await page.getByRole('button', { name: 'Open in editor' }).first().isEnabled()).toBe(false)
      await page.locator('#host-field').focus()
      await page.keyboard.press('Control+k')
      expect(await page.evaluate('hostShortcuts')).toBe(1)
      await page.getByRole('button', { name: 'Focus 0', exact: true }).focus()
      await page.keyboard.press('Control+k')
      expect(await page.locator('#first').getByRole('searchbox').evaluate(element => element === document.activeElement)).toBe(true)
      expect(await page.evaluate('hostShortcuts')).toBe(1)
      await chooseHistoireSelectOption(page.locator('#first'), page, 'Appearance', 'dark')
      await chooseHistoireSelectOption(page.locator('#first'), page, 'Direction', 'RTL')
      await page.locator('#first').getByRole('spinbutton', { name: 'Viewport width' }).fill('410')
      await page.locator('#first').getByRole('spinbutton', { name: 'Viewport width' }).blur()
      expect(await page.evaluate('sessions[0].getSnapshot().settings')).toMatchObject({ colorScheme: 'dark', textDirection: 'rtl', responsiveWidth: 410 })
      expect(await page.evaluate('sessions[1].getSnapshot().settings.colorScheme')).toBe('auto')
      stage = 'primary creation'
      await page.evaluate(`(async()=>{await sessions[1].selection.select({storyId:'a:b',variantId:'one:alpha'});shown.forEach(value=>value.value=true)})()`)
      await expect.poll(() => page.evaluate('sessions.map(session=>session.getSnapshot().runtime.status)')).toEqual(['ready', 'ready'])
      const sandboxes = page.frames().filter(frame => frame.url().includes('__sandbox.html'))
      const grid = sandboxes.find(frame => new URL(frame.url()).searchParams.get('grid') === 'true')!
      const single = sandboxes.find(frame => new URL(frame.url()).searchParams.get('grid') === 'false')!
      stage = 'source focus shortcut'
      await grid.getByRole('button', { name: 'Emit first' }).focus()
      await page.keyboard.press('Control+k')
      await expect.poll(() => page.locator('#first').getByRole('searchbox').evaluate(element => element === document.activeElement)).toBe(true)
      expect(await page.evaluate('hostShortcuts')).toBe(1)
      stage = 'grid second event'
      await grid.getByRole('button', { name: 'Emit second' }).click()
      await expect.poll(() => page.evaluate('received[0].length')).toBe(2)
      expect(await page.evaluate('received[0].map(event=>event.target)')).toEqual([{ storyId: 'a:b', variantId: 'two' }, { storyId: 'a:b', variantId: 'two' }])
      expect(await page.evaluate('received[0][0].payload.argument')).toMatchObject({ type: 'click', target: 'Node' })
      expect(await page.evaluate('received[0][1].payload.argument')).toEqual({ label: 'second', nested: { count: 2 } })
      expect(await page.evaluate('received[0].every(event=>event.runtimeId===sessions[0].getSnapshot().runtime.runtimeId)')).toBe(true)
      await expect.poll(() => page.evaluate('sessions[0].getSnapshot().selection')).toEqual({ storyId: 'a:b', variantId: 'two' })
      await page.evaluate(`sessions[0].selection.select({storyId:'a:b',variantId:'one:alpha'})`)
      stage = 'grid first event'
      await grid.getByRole('button', { name: 'Emit first' }).click()
      stage = 'single event'
      await single.getByRole('button', { name: 'Emit first' }).click()
      await expect.poll(() => page.evaluate('received.map(events=>events.length)')).toEqual([4, 2])
      stage = 'events view'
      await page.evaluate(`(async()=>{window.eventsView=sessions[0].mount(document.querySelector('#event-frame'),{surface:'events'});await eventsView.ready})()`)
      const events = page.frames().find(frame => new URL(frame.url()).searchParams.get('surface') === 'events')!
      await expect.poll(() => events.getByRole('button', { name: /^nested/ }).count()).toBe(1)
      stage = 'event details'
      await events.getByRole('button', { name: /^nested/ }).click()
      await expect.poll(() => events.locator('pre').textContent()).toContain('first')
      stage = 'clear events'
      await events.getByRole('button', { name: 'Clear events', exact: true }).click()
      await expect.poll(() => page.evaluate('sessions[0].getSnapshot().events.items.length')).toBe(0)
      await expect.poll(() => events.getByRole('button', { name: /^nested/ }).count()).toBe(0)
      stage = 'host navigation'
      await page.getByRole('link', { name: 'Host navigation' }).click()
      expect(new URL(page.url()).pathname).toBe('/other')
      expect(await page.locator('#host-field').inputValue()).toBe('host value')
      expect(await page.title()).toBe('Host title')
      await page.screenshot({ path: '/tmp/histoire-sdk12-independent-panels.png', fullPage: true })
      stage = 'teardown'
      await page.evaluate('apps.forEach(app=>app.unmount());Promise.all(sessions.map(session=>session.dispose()))')
      await expect.poll(() => page.locator('iframe').count()).toBe(0)
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
