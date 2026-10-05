import type { Browser, Page } from 'playwright'

/** Real mocked story retains object option values and callbacks inside source runtime. */
export const embedControlsStory = `<script lang="ts">
import {vi} from 'vitest'
import {greeting} from './greeting'
vi.mock('./greeting',()=>({greeting:()=> 'mocked-controls'}))
</script><script setup lang="ts">
const message=greeting()
const options=Array.from({length:50},(_,index)=>({label:'Choice '+index,value:{name:'Choice '+index,index,run(){return this.index+1}}}))
function initial(){return{count:2,label:'Initial',choice:options[0].value,expanded:true,callbackCount:0}}
function select(state,value){state.callbackCount=value.run();state.count=value.index}
</script><template><Story id="controls" title="Controls">
<Variant id="custom" :init-state="initial"><template #default="{state}"><button @click="state.count++">{{message}}:{{state.count}}:{{state.label}}:{{state.choice.name}}:{{state.callbackCount}}</button></template><template #controls="{state}">
<HstCheckbox v-model="state.expanded" title="Extra controls"/><HstText v-model="state.label" title="Label"/><textarea v-if="state.expanded" aria-label="Extra field" style="height:90px"/><HstSelect v-model="state.choice" title="Choice" :options="options" @update:model-value="value=>select(state,value)"/><input aria-label="Next control"/>
</template></Variant>
<Variant id="generic" :init-state="()=>({count:4,label:'Generic'})"><template #default="{state}"><button @click="state.count++">generic:{{state.count}}:{{state.label}}</button></template></Variant>
</Story></template>`

/** Two transformed roots and unrelated host form expose geometry/style/focus mistakes. */
export const embedControlsHostHtml = `<!doctype html><html><head><style>body{margin:37px;min-height:1800px;background:lavender;color:navy;font:18px Georgia}input{border:3px solid orange}#books{display:flex;gap:40px;margin-top:90px}.book{width:420px;height:540px}#first{transform:scale(.85);transform-origin:top left}.content{height:100%;display:flex;flex-direction:column}.preview{flex:1;min-height:0}.controls{flex:none}</style></head><body><label>Host field<input id="host-field" value="Host value"/></label><div id="books"><div id="first" class="book"></div><button id="after-first">Host next</button><div id="second" class="book"></div></div></body></html>`

/** Test-owned warm runtime completes cold dev optimization before consumer connection. */
export async function warmEmbedControlsSource(browser: Browser, bookUrl: string): Promise<void> {
  const page = await browser.newPage()
  try {
    await page.goto(new URL('__sandbox.html?storyId=controls&variantId=custom&embed=true', bookUrl).href)
    await page.getByRole('button', { name: 'mocked-controls:2:Initial:Choice 0:0', exact: true }).waitFor({ timeout: 60_000 })
  }
  finally { await page.close() }
}

/** Same actual host Vue package build shared by native controls browser scenarios. */
export async function mountEmbedControlsHost(page: Page, bookUrl: string): Promise<void> {
  await page.evaluate(`(async()=>{
    await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/native.css';link.onload=resolve;link.onerror=reject;document.head.append(link)});
    const {subscribeHistoireMountEvents,createHistoireSession,createApp,h,HistoireProvider,HistoirePreview,HistoireControls}=await import('/native.js');window.sessions=[];window.apps=[];window.nativeErrors=[];window.overlayEvents=[];window.controlsMounts=[];
    for(let index=0;index<2;index++){
      const session=createHistoireSession({url:${JSON.stringify(bookUrl)}});await session.connect();await session.selection.select({storyId:'controls',variantId:'custom'});sessions.push(session);const original=session.mount.bind(session);session.mount=(container,options)=>{const handle=original(container,options);if(options.surface==='controls'){controlsMounts[index]=handle;subscribeHistoireMountEvents(handle,event=>overlayEvents.push({event:event.event,payload:event.payload}));}return handle};
      let resolveReady,rejectReady;const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
      const app=createApp({render:()=>h(HistoireProvider,{session,onError:error=>nativeErrors.push(error.code??error.message)},{default:()=>h('div',{class:'content'},[h(HistoirePreview,{class:'preview',onReady:resolveReady,onError:rejectReady}),h(HistoireControls,{class:'controls'})])})});app.mount(index?'#second':'#first');apps.push(app);await ready;
    }
  })()`)
}

/** Wait actual owning controls lifecycle, including replacement after navigation. */
export async function waitEmbedControlsReady(page: Page, index = 0, previousId?: string): Promise<void> {
  await page.waitForFunction(({ index, previousId }) => {
    const handle = (window as any).controlsMounts?.[index]
    return handle && handle.id !== previousId
  }, { index, previousId })
  await page.evaluate(index => (window as any).controlsMounts[index].ready, index)
}

/** Exact custom controls sandbox for one provider, never primary story iframe. */
export function embedCustomControlsFrame(page: Page, index = 0) {
  const bridge = page.frames().filter(frame => frame.url().includes('__embed.html') && new URL(frame.url()).searchParams.get('view') === 'bridge')[index]
  const sessionId = bridge && new URL(bridge.url()).searchParams.get('sessionId')
  return page.frames().find(frame => frame.url().includes('__sandbox.html') && new URL(frame.url()).searchParams.get('controls') === 'true'
    && frame.parentFrame()?.url().includes('__embed.html') && new URL(frame.parentFrame()!.url()).searchParams.get('sessionId') === sessionId)!
}
