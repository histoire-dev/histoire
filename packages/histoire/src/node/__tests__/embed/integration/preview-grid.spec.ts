import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

const story = `<script setup>
import { useHistoireGlobals } from 'histoire/client'
const globals = useHistoireGlobals()
class Model { value = 'instance' }
function initial() { return { count:4, callback:()=>'callback', model:new Model() } }
</script>
<template><Story id="runtime" title="Runtime" :layout="{type:'grid',width:260}">
<Variant id="one" :meta="{owner:'one'}" :init-state="initial"><template #default="{state}"><button @click="state.count++">one:{{state.count}}:{{globals.token}}:{{state.callback()}}:{{state.model.value}}</button></template></Variant>
<Variant id="two" :meta="{owner:'two'}" :init-state="initial"><template #default="{state}"><button @click="state.count++">two:{{state.count}}:{{globals.token}}</button></template></Variant>
</Story></template><style>html.runtime-dark button { background:#111827;color:white } html:not(.runtime-dark) button {background:white;color:#111827} button{padding:12px}</style>`
/** One 24-cell fixture covers lazy scrolling and direct distant selection. */
const lazyGridStory = `<template><Story id="scroll-grid" :layout="{type:'grid',width:260}">${Array.from({ length: 24 }, (_, index) => `<Variant id="cell-${index}"><button style="height:180px">Cell ${index}</button></Variant>`).join('')}</Story></template>`
const setup = `export function setupVue3({app,variant,globals}) { if(variant && typeof window!=='undefined') { window.__SETUP_VARIANTS__ ??= []; window.__SETUP_VARIANTS__.push({id:variant.id,meta:variant.meta.owner,globals}); app.provide('variant-owner',variant.id) } }`

/** Scroll actual grid overflow owner, independent of reusable UI class names. */
function scrollGrid(frame: any, bottom: boolean) {
  return frame.evaluate((toBottom) => {
    let element = document.querySelector<HTMLElement>('[data-histoire-runtime-content]')?.parentElement
    while (element && !(/auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight)) element = element.parentElement
    if (!element) throw new Error('Grid scroll owner absent')
    element.scrollTop = toBottom ? element.scrollHeight : 0
    return { top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight }
  }, bottom)
}

describe('real preview/grid runtime ownership', () => {
  it('retains runtime callbacks/defaults, grid variant state, globals, explicit hidden runtime and document identity', async () => {
    const fixture = await createEmbedBridgeFixture({ story, setup, config: 'preview:{globals:{token:\'default\'}}, sandboxDarkClass:\'runtime-dark\',' })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.stack ?? error.message))
    try {
      await page.addInitScript(() => {
        // Initial inherited about:blank can precede source navigation. Deny all
        // fixture child frames so restrictions exist before any source code.
        if (window === window.top) return
        for (const key of ['localStorage', 'sessionStorage']) {
          Object.defineProperty(window, key, {
            configurable: true,
            get() {
              throw new DOMException('Storage denied', 'SecurityError')
            },
          })
        }
      })
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{ const {createHistoireSession}=await import('/sdk.js'); window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}}); await session.connect(); await session.selection.select({storyId:'runtime',variantId:'one'}); window.primary=session.mount(document.querySelector('#mount'),{surface:'preview'}); await primary.ready })()`)
      expect(await page.evaluate('session.getSnapshot().runtime.status')).toBe('ready')
      expect(await page.evaluate('(async()=> (await session.state.get()).value.count)()')).toBe(4)
      await page.evaluate('session.state.patch({count:9})')
      const sandbox = () => page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      await expect.poll(() => sandbox().getByRole('button').textContent()).toBe('one:9:default:callback:instance')
      await page.evaluate('session.settings.update({responsiveWidth:420,responsiveHeight:300})')
      await expect.poll(() => sandbox().evaluate(() => [innerWidth, innerHeight])).toEqual([420, 300])
      await page.evaluate('session.settings.update({rotate:true})')
      await expect.poll(() => sandbox().evaluate(() => [innerWidth, innerHeight])).toEqual([300, 420])
      await page.evaluate('session.settings.update({responsiveWidth:720,responsiveHeight:null,rotate:false})')
      await sandbox().getByRole('button').screenshot({ path: '/tmp/histoire-sdk-08-runtime-light.png' })
      const documentOne = await page.evaluate('session.getSnapshot().runtime.runtimeId')
      await page.evaluate('session.settings.update({globals:{token:"changed"},colorScheme:"dark"})')
      await expect.poll(() => sandbox().getByRole('button').textContent()).toBe('one:9:changed:callback:instance')
      await sandbox().getByRole('button').screenshot({ path: '/tmp/histoire-sdk-08-runtime-dark.png' })
      expect(await page.evaluate(`(async()=>{try{await session.settings.update({globals:{'bad key':'value'}});return 'accepted'}catch(error){return error.code}})()`)).toBe('INVALID_ARGUMENT')
      await page.evaluate('session.state.reset()')
      await expect.poll(() => sandbox().getByRole('button').textContent()).toBe('one:4:changed:callback:instance')
      expect(await sandbox().evaluate(() => (window as any).__SETUP_VARIANTS__.find(item => item.id === 'one').meta)).toBe('one')
      const source = await page.evaluate('session.source.get({storyId:"runtime",variantId:"one",mode:"dynamic"})')
      expect(source.body).toContain('button')
      await page.evaluate('primary.unmount()')
      await page.evaluate('window.primary=session.mount(document.querySelector("#mount"),{surface:"grid"}); primary.ready')
      const gridDocument = await page.evaluate('session.getSnapshot().runtime.runtimeId')
      expect(gridDocument).not.toBe(documentOne)
      await sandbox().evaluate(documentId => parent.postMessage({ __histoire: true, type: '__histoire:state-sync', documentId, storyId: 'runtime', variantId: 'one', state: { count: 999 } }, location.origin), documentOne)
      expect(await page.evaluate('(async()=> (await session.state.get()).value.count)()')).toBe(4)
      await expect.poll(() => sandbox().getByRole('button', { name: /^two:/ }).textContent()).toBe('two:4:changed')
      await page.evaluate('session.state.patch({count:7})')
      // Repeated caller must share pending ACK; capture readiness immediately
      // after only the repeated promise settles, before waiting original caller.
      const repeated = await page.evaluate(`(async()=>{
        const first=session.selection.select({storyId:'runtime',variantId:'two'});
        const second=session.selection.select({storyId:'runtime',variantId:'two'});
        await second;const status=session.getSnapshot().runtime.status;
        const state=await session.state.get().then(value=>value.value.count,error=>error.code);
        await first;return {status,state};
      })()`)
      expect(repeated).toEqual({ status: 'ready', state: 4 })
      expect(await page.evaluate('(async()=> (await session.state.get()).value.count)()')).toBe(4)
      await page.evaluate('session.state.patch({count:12})')
      await page.evaluate('session.selection.select({storyId:"runtime",variantId:"one"})')
      expect(await page.evaluate('(async()=> (await session.state.get()).value.count)()')).toBe(7)
      expect(await page.evaluate('session.getSnapshot().runtime.runtimeId')).toBe(gridDocument)
      // Both source wrapper and story sandbox must retain bridge-owned settings
      // when storage access throws, rather than silently restoring local defaults.
      for (const frame of page.frames().filter(frame => /__embed\.html|__sandbox\.html/.test(frame.url()))) {
        const storage = await frame.evaluate(() => ['localStorage', 'sessionStorage'].map((key) => {
          try {
            return typeof window[key]
          }
          catch (error) {
            return error.name
          }
        }))
        expect(storage, frame.url()).toEqual(['SecurityError', 'SecurityError'])
      }
      expect(await page.evaluate('session.getSnapshot().settings.colorScheme')).toBe('dark')
      await page.evaluate('session.settings.update({colorScheme:"light"})')
      expect(await page.evaluate('session.getSnapshot().settings.colorScheme')).toBe('light')
      expect(await sandbox().getByRole('button', { name: /^one:/ }).textContent()).toBe('one:7:changed:callback:instance')
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.viewports.length')).toBe(2)
      const geometry = await page.evaluate('session.getSnapshot().runtime.viewports')
      expect(geometry.map(viewport => viewport.target.variantId).sort()).toEqual(['one', 'two'])
      expect(geometry[0].x !== geometry[1].x || geometry[0].y !== geometry[1].y).toBe(true)
      expect(await page.evaluate('session.getSnapshot().runtime.viewport.target.variantId')).toBe('one')
      const clipHeight = geometry[0].visibleRect.y + geometry[0].visibleRect.height / 2
      await page.evaluate((height) => {
        document.querySelector<HTMLElement>('#mount')!.style.height = `${height}px`
        document.querySelector<HTMLElement>('#mount')!.style.overflow = 'hidden'
      }, clipHeight)
      await expect.poll(() => page.evaluate(limit => (window as any).session.getSnapshot().runtime.viewports.every(viewport => viewport.visibleRect.y + viewport.visibleRect.height <= limit), clipHeight)).toBe(true)
      expect(await page.evaluate('session.getSnapshot().runtime.viewports.length')).toBeGreaterThan(0)
      await page.evaluate('document.querySelector("#mount").style.height="560px"')
      await page.evaluate('document.querySelector("#mount").style.transform="scale(.5)";document.querySelector("#mount").style.transformOrigin="top left";dispatchEvent(new Event("resize"))')
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.viewports.every(viewport=>viewport.scale===.5)')).toBe(true)
      await page.evaluate('document.querySelector("#mount").style.transform="";document.querySelector("#mount").style.position="relative";document.querySelector("#mount").style.top="2000px";dispatchEvent(new Event("resize"))')
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.viewports.length')).toBe(0)
      expect(await page.evaluate('session.getSnapshot().runtime.viewport')).toBe(null)
      await page.evaluate('document.querySelector("#mount").style.top="0";dispatchEvent(new Event("resize"))')
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.viewports.length')).toBe(2)
      const setups = await sandbox().evaluate(() => (window as any).__SETUP_VARIANTS__)
      expect(setups.map(item => [item.id, item.meta]).sort()).toEqual([['one', 'one'], ['two', 'two']])
      await page.evaluate('primary.unmount();')
      await page.evaluate('const button=document.createElement("button");button.textContent="Host action";button.onclick=()=>window.hostClicks=(window.hostClicks??0)+1;document.body.append(button)')
      await page.evaluate('const input=document.createElement("input");input.setAttribute("aria-label","Host input");document.body.append(input);input.focus()')
      await page.evaluate('window.primary=session.createHiddenPreview(); primary.ready')
      expect(await page.getByRole('textbox', { name: 'Host input' }).evaluate(input => input === document.activeElement)).toBe(true)
      expect(await page.evaluate('session.getSnapshot().runtime.viewports')).toEqual([])
      expect(await sandbox().evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: 720, height: 560 })
      await page.evaluate('session.state.patch({count:20})')
      expect(await page.evaluate('(async()=> (await session.state.get()).value.count)()')).toBe(20)
      await page.getByRole('button', { name: 'Host action' }).click()
      expect(await page.evaluate('hostClicks')).toBe(1)
      await page.screenshot({ path: '/tmp/histoire-sdk-08-hidden-host.png' })
      await page.evaluate('session.dispose()')
      expect(await page.locator('iframe').count()).toBe(0)
      expect(errors).toEqual([])
    }
    catch (error) {
      console.error('Preview runtime browser errors:', errors)
      for (const frame of page.frames()) {
        if (frame.url().includes('__sandbox.html') || frame.url().includes('__embed.html')) console.error('Preview frame:', frame.url(), (await frame.locator('body').textContent({ timeout: 1000 }).catch(() => 'unavailable')).slice(0, 2000))
      }
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('admits directly selected lazy cell without caller scrolling or resizing', async () => {
    const fixture = await createEmbedBridgeFixture({ story: lazyGridStory })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{const {createHistoireSession}=await import('/sdk.js');window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await session.connect();await session.selection.select({storyId:'scroll-grid',variantId:'cell-0'});window.primary=session.mount(document.querySelector('#mount'),{surface:'grid'});await primary.ready})()`)
      const sandbox = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      const roots = sandbox.locator('[data-histoire-runtime-content]')
      await expect.poll(() => roots.count()).toBe(10)
      // Drain initial source/container observers; they must not accidentally
      // rescue selection that has no corresponding reactive admission.
      await page.waitForTimeout(1000)
      const hostBox = await page.locator('#mount').boundingBox()
      const runtimeId = await page.evaluate('session.getSnapshot().runtime.runtimeId')
      await page.evaluate('window.selecting=session.selection.select({storyId:"scroll-grid",variantId:"cell-23"});void selecting.catch(()=>{})')
      await expect.poll(() => page.evaluate('({status:session.getSnapshot().runtime.status,target:session.getSnapshot().selection.variantId})'), { timeout: 5000 }).toEqual({ status: 'ready', target: 'cell-23' })
      await page.evaluate('selecting')
      expect(await roots.count()).toBe(24)
      expect(await page.locator('#mount').boundingBox()).toEqual(hostBox)
      expect(await page.evaluate('session.getSnapshot().runtime.runtimeId')).toBe(runtimeId)
      await page.evaluate('session.dispose()')
      expect(errors).toEqual([])
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('replaces visible geometry during inner-grid scrolling and admits newly rendered lazy cells', async () => {
    const fixture = await createEmbedBridgeFixture({ story: lazyGridStory })
    const page = await fixture.browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      await page.evaluate(`(async()=>{ const {createHistoireSession}=await import('/sdk.js'); window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}}); await session.connect(); await session.selection.select({storyId:'scroll-grid',variantId:'cell-0'}); window.primary=session.mount(document.querySelector('#mount'),{surface:'grid'}); await primary.ready })()`)
      const sandbox = page.frames().find(frame => frame.url().includes('__sandbox.html'))!
      const roots = sandbox.locator('[data-histoire-runtime-content]')
      await expect.poll(() => roots.count()).toBe(10)
      const initial = await page.evaluate('session.getSnapshot().runtime.viewports')
      expect(initial.length).toBeGreaterThanOrEqual(2)
      expect(initial.every(viewport => viewport.target.storyId === 'scroll-grid')).toBe(true)
      const runtimeId = await page.evaluate('session.getSnapshot().runtime.runtimeId')
      // Initial selected-cell resize can restore its position while siblings
      // finish mounting. Keep explicit scrolling until lazy admission completes.
      await expect.poll(async () => {
        await scrollGrid(sandbox, true)
        return roots.count()
      }).toBe(24)
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.viewports.some(viewport=>viewport.target.variantId==="cell-23")')).toBe(true)
      const scrolled = await page.evaluate('session.getSnapshot().runtime.viewports')
      expect(scrolled.some(viewport => initial.some(old => old.target.variantId === viewport.target.variantId))).toBe(false)
      expect(await page.evaluate('session.getSnapshot().runtime.viewport')).toBe(null)
      await page.evaluate('session.selection.select({storyId:"scroll-grid",variantId:"cell-23"})')
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.viewport?.target.variantId')).toBe('cell-23')
      await scrollGrid(sandbox, false)
      await expect.poll(() => page.evaluate('session.getSnapshot().runtime.viewports.some(viewport=>viewport.target.variantId==="cell-0")')).toBe(true)
      expect(await page.evaluate('session.getSnapshot().runtime.viewports.some(viewport=>viewport.target.variantId==="cell-23")')).toBe(false)
      expect(await page.evaluate('session.getSnapshot().runtime.runtimeId')).toBe(runtimeId)
      await page.evaluate('session.dispose()')
      expect(await page.locator('iframe').count()).toBe(0)
      expect(errors).toEqual([])
    }
    catch (error) {
      await page.screenshot({ path: '/tmp/histoire-sdk16-grid-scroll-failure.png' })
      console.error('Grid failure:', errors, await page.evaluate('session.getSnapshot().runtime'))
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
