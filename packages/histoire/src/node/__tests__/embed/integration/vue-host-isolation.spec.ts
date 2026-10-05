import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { createEmbedVueHostAssets } from '../../utils/embed/vue-host.js'

const story = `<template><Story id="native" title="Native story"><Variant id="one" :init-state="()=>({count:2})"><template #default="{state}"><button @click="state.count++">native:{{state.count}}</button></template></Variant><Variant id="two"><button>second</button></Variant></Story></template>`
const hostHtml = `<!doctype html><html><head><style>body{margin:19px;background:lavender;color:navy;font:18px Georgia}input{border:3px solid orange}a{color:purple;text-decoration:underline}#router{height:100px}#hosts{display:flex;gap:20px}.host-book{width:400px;height:420px}.host-content{display:flex;flex-direction:column;height:100%}.native-controls{flex:none}.native-preview{flex:1;min-height:0}</style></head><body><div id="router"></div><label>Host field<input id="host-field" value="host value"></label><div id="hosts"><form id="host-form"><div id="first" class="host-book"></div></form><div id="second" class="host-book"></div></div></body></html>`

describe('native Vue host isolation', () => {
  it('keeps host router/form/styles, two sessions, scoped themes/overlays and runtime cleanup independent', async () => {
    const fixture = await createEmbedBridgeFixture({ story, hostHtml, hostModules: await createEmbedVueHostAssets() })
    const page = await fixture.browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${fixture.hostOrigin}/host.html`)
      const hostBefore = await page.locator('#host-field').boundingBox()
      await page.evaluate(`(async()=>{
        await new Promise((resolve,reject)=>{ const link=document.createElement('link'); link.rel='stylesheet'; link.href='/native.css'; link.onload=resolve; link.onerror=reject; document.head.append(link) });
        const native=await import('/native.js'), sdk=await import('/sdk.js');
        const {createApp,defineComponent,h,ref,onMounted,HistoireProvider,HistoirePreview,HistoireVariantGrid,HistoireToolbar,useHistoireSnapshot,useHistoireContext,HstText,HstSelect,HistoireDropdown,createRouter,createWebHistory,RouterLink,RouterView}=native;
        window.nativeErrors=[]; window.sessions=[]; window.apps=[]; window.sizes=[]; window.texts=[];
        window.hostSubmits=0; document.querySelector('#host-form').addEventListener('submit',event=>{event.preventDefault();window.hostSubmits++});
        const router=createRouter({history:createWebHistory(),routes:[{path:'/host.html',component:{render:()=>h('p','Host home')}},{path:'/other',component:{render:()=>h('p','Host other')}}]});
        createApp({render:()=>h('div',[h(RouterLink,{to:'/other'},()=> 'Host navigation'),h(RouterView)])}).use(router).mount('#router');
        for(let index=0;index<2;index++){
          const session=sdk.createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}}); await session.connect(); await session.selection.select({storyId:'native',variantId:'one'}); window.sessions.push(session);
          const text=ref('local-'+index),selected=ref('one'),primary=ref(index?'grid':'preview'); window.texts.push(text);
          const Child=defineComponent({setup(){const snapshot=useHistoireSnapshot(),context=useHistoireContext(); window.sizes[index]=context.size; return()=>h('div',{class:'host-content'},[
            h('output',{'data-native-status':index},snapshot.value.runtime.status),
            h('output',{'data-native-size':index},context.size.value.width+'x'+context.size.value.height),
            index===0?h(HistoireToolbar):null,
            h('div',{class:'native-controls'},[h(HstText,{title:'Text '+index,modelValue:text.value,'onUpdate:modelValue':value=>text.value=value}),h(HstSelect,{title:'Choice '+index,modelValue:selected.value,options:{one:'First option',two:'Second option'},'onUpdate:modelValue':value=>selected.value=value}),h(HistoireDropdown,{placement:'bottom'}, {default:()=>h('button',{type:'button'},'Local menu '+index),popper:()=>h('button',{type:'button'},'Menu content '+index)})]),
            h(primary.value==='grid'?HistoireVariantGrid:HistoirePreview,{key:primary.value,class:'native-preview',onError:error=>nativeErrors.push(error.code)})
          ])}});
          const app=createApp({render:()=>h(HistoireProvider,{session,onError:error=>nativeErrors.push(error.code)},{default:()=>h(Child)})}); app.mount(index?'#second':'#first'); window.apps.push(app);
        }
      })()`)
      await expect.poll(() => page.locator('[data-native-status="0"]').textContent()).toBe('ready')
      await expect.poll(() => page.locator('[data-native-status="1"]').textContent()).toBe('ready')
      // Native actions operate inside caller forms without submitting them.
      const rotate = page.locator('#first').getByRole('button', { name: 'Rotate', exact: true })
      await rotate.click()
      await expect.poll(() => page.evaluate('sessions[0].getSnapshot().settings.rotate')).toBe(true)
      await rotate.click()
      expect(await page.evaluate('window.hostSubmits')).toBe(0)
      const sandbox = () => page.frames().filter(frame => frame.url().includes('__sandbox.html'))
      expect(sandbox()).toHaveLength(2)
      expect(await page.evaluate('sessions[1].getSnapshot().runtime.layout')).toBe('grid')
      expect(await page.evaluate('window.__hst_controls_dark')).toBeUndefined()
      await sandbox()[0].getByRole('button', { name: 'native:2' }).click()
      await expect.poll(() => page.evaluate('sessions[0].state.get().then(state=>state.value.count)')).toBe(3)
      expect(await page.evaluate('sessions[1].state.get().then(state=>state.value.count)')).toBe(2)
      await page.locator('#first input[type="text"]').fill('host Vue edit')
      expect(await page.evaluate('texts[0].value')).toBe('host Vue edit')
      expect(await page.locator('#second input[type="text"]').inputValue()).toBe('local-1')
      await page.getByRole('button', { name: 'Choice 0' }).click()
      await page.locator('#first').getByText('Second option', { exact: true }).click()
      expect(await page.getByRole('button', { name: 'Choice 0' }).textContent()).toContain('Second option')
      // Firefox can keep this earlier control focused when pointer activation
      // opens another dropdown. Escape must restore that dropdown's own trigger.
      await page.getByRole('button', { name: 'Choice 0' }).focus()
      await page.getByRole('button', { name: 'Local menu 0' }).click()
      await expect.poll(() => page.locator('#first').getByRole('button', { name: 'Menu content 0' }).isVisible()).toBe(true)
      expect(await page.locator('#second').getByRole('button', { name: 'Menu content 0' }).count()).toBe(0)
      await page.keyboard.press('Escape')
      await expect.poll(() => page.locator('#first').getByRole('button', { name: 'Menu content 0' }).isVisible()).toBe(false)
      expect(await page.getByRole('button', { name: 'Local menu 0' }).evaluate((element: HTMLElement) => element === element.ownerDocument.activeElement)).toBe(true)
      await page.evaluate('sessions[1].settings.update({colorScheme:"light"})')
      await page.evaluate('document.querySelector("#first").style.width="480px"')
      await expect.poll(() => page.locator('[data-native-size="0"]').textContent()).toContain('480x')
      await page.getByRole('link', { name: 'Host navigation' }).click()
      expect(new URL(page.url()).pathname).toBe('/other')
      expect(await page.locator('#router').textContent()).toContain('Host other')
      expect(await page.locator('#host-field').inputValue()).toBe('host value')
      expect(await page.locator('#host-field').boundingBox()).toEqual(hostBefore)
      await page.screenshot({ path: '/tmp/histoire-sdk-native-isolation.png', fullPage: true })
      // Structured-clone state remains canonical even when JSON editing cannot
      // round-trip it. A second provider renders independent controls only.
      await page.evaluate(`(async()=>{
        const cycle={label:'cyclic'}; cycle.self=cycle;
        await sessions[0].state.patch({cycle,counter:12n});
        const {createApp,h,HistoireProvider,HistoireControls}=await import('/native.js');
        const container=document.createElement('div'); container.id='json-controls'; document.body.append(container);
        window.jsonApp=createApp({render:()=>h(HistoireProvider,{session:sessions[0],onError:error=>nativeErrors.push(error.code)},{default:()=>h(HistoireControls)})});
        jsonApp.mount(container);
      })()`)
      const jsonControls = page.locator('#json-controls')
      await expect.poll(() => jsonControls.getByText('JSON editing unavailable', { exact: true }).count()).toBe(2)
      await jsonControls.getByRole('spinbutton', { name: 'count', exact: true }).fill('27')
      await expect.poll(() => page.evaluate('sessions[0].getSnapshot().state.value.count')).toBe(27)
      expect(await page.evaluate('(()=>{const value=sessions[0].getSnapshot().state.value;return value.counter===12n&&value.cycle.self===value.cycle})()')).toBe(true)
      await page.evaluate('jsonApp.unmount();document.querySelector("#json-controls").remove()')
      await page.evaluate('apps[0].unmount()')
      await expect.poll(() => sandbox().length).toBe(1)
      expect(await page.evaluate('sessions[0].getSnapshot().status')).toBe('ready')
      await page.evaluate('sessions[0].settings.update({colorScheme:"light"})')
      expect(await page.evaluate('sessions[1].state.get().then(state=>state.value.count)')).toBe(2)
      await page.evaluate('apps[1].unmount(); Promise.all(sessions.map(session=>session.dispose()))')
      await expect.poll(() => page.locator('iframe').count()).toBe(0)
      expect(await page.evaluate('nativeErrors')).toEqual([])
      expect(errors).toEqual([])
    }
    catch (error) {
      await page.screenshot({ path: '/tmp/histoire-sdk-native-isolation-failure.png', fullPage: true })
      throw error
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
